package run

import (
	"context"
	"errors"
	"fmt"

	"orson/internal/correlation"
	"orson/internal/kafka"

	"github.com/google/uuid"
)

type Coordinator struct {
	kafkaClient KafkaClient
}

func NewCoordinator(kafkaClient KafkaClient) (*Coordinator, error) {
	if kafkaClient == nil {
		return nil, errors.New("kafka client is required")
	}

	return &Coordinator{kafkaClient: kafkaClient}, nil
}

// Run executes one root event and emits ordered lifecycle events until the
// capture timeout, cancellation, or an explicit Kafka failure.
func (c *Coordinator) Run(ctx context.Context, request RunRequest, sink EventSink) error {
	if request.RunID == "" {
		return ErrMissingRunID
	}
	if request.CaptureTimeout <= 0 {
		return errors.New("capture timeout must be positive")
	}
	correlationHeader := correlation.ResolveHeader(request.CorrelationHeader)
	for _, header := range request.RootMessage.Headers {
		if correlation.HeaderNamesEqual(header.Key, correlationHeader) {
			return fmt.Errorf("correlation header %q is managed automatically", correlationHeader)
		}
	}

	emitter := &eventEmitter{runID: request.RunID, sink: sink}
	emitter.emit(Event{Kind: EventStarted, Status: RunStatusStarting})

	offsets, err := c.kafkaClient.ReadEndOffsets(ctx, request.WatchedTopics)
	if err != nil {
		return c.finishAfterCapture(ctx, emitter, RunStatusFailed, &Failure{
			Stage: FailureStageCapture,
			Err:   fmt.Errorf("coordinator reading offsets: %w", err),
		})
	}

	rootMessage := request.RootMessage
	correlationID, err := newCorrelationID()
	if err != nil {
		return c.finishAfterCapture(ctx, emitter, RunStatusFailed, &Failure{
			Stage: FailureStageProcessing,
			Err:   fmt.Errorf("coordinator generating correlation ID: %w", err),
		})
	}
	rootMessage.Headers = append(rootMessage.Headers, kafka.Header{
		Key:   correlationHeader,
		Value: []byte(correlationID),
	})

	captureCtx, stopCapture := context.WithTimeout(ctx, request.CaptureTimeout)
	defer stopCapture()

	recordsCh := make(chan kafka.Record, 16)
	captureDoneCh := make(chan error, 1)
	captureReadyCh := make(chan struct{})
	go func() {
		err := c.kafkaClient.ReadFromOffsets(
			captureCtx,
			offsets,
			func() {
				close(captureReadyCh)
			},
			func(record kafka.Record) error {
				if !hasCorrelationID(record, correlationHeader, correlationID) {
					return nil
				}

				select {
				case recordsCh <- record:
					return nil
				case <-captureCtx.Done():
					return captureCtx.Err()
				}
			},
		)
		captureDoneCh <- err
	}()

	captureFinished := false
	var captureErr error
	waitForCapture := func() error {
		if captureFinished {
			return captureErr
		}

		stopCapture()
		captureErr = <-captureDoneCh
		captureFinished = true
		return captureErr
	}

	finish := func(status RunStatus, failure *Failure) error {
		waitForCapture()
		failure = terminalFailure(status, failure)
		emitter.emit(Event{Kind: EventFinished, Status: status, Failure: failure})
		return nil
	}

	select {
	case <-captureReadyCh:
		emitter.emit(Event{Kind: EventReady, Status: RunStatusInProgress})
	case err := <-captureDoneCh:
		captureErr = err
		captureFinished = true
		status, failure := captureTerminalResult(ctx, captureCtx, err)
		return finish(status, failure)
	case <-ctx.Done():
		return finish(RunStatusCancelled, &Failure{Stage: FailureStageCancellation, Err: ctx.Err()})
	case <-captureCtx.Done():
		status, failure := captureTerminalResult(ctx, captureCtx, captureCtx.Err())
		return finish(status, failure)
	}

	rootRecord, err := c.kafkaClient.PublishMessage(captureCtx, rootMessage)
	if err != nil {
		status, failure := publishTerminalStatus(ctx, captureCtx, err)
		return finish(status, failure)
	}
	emitter.emit(Event{
		Kind:   EventRootPublished,
		Status: RunStatusInProgress,
		Record: &rootRecord,
	})

	for {
		select {
		case record := <-recordsCh:
			if isSameRecord(record, rootRecord) {
				continue
			}
			emitter.emit(Event{Kind: EventMessage, Status: RunStatusInProgress, Record: &record})

		case err := <-captureDoneCh:
			captureErr = err
			captureFinished = true
			status, failure := captureTerminalResult(ctx, captureCtx, err)
			return finish(status, failure)

		case <-ctx.Done():
			return finish(RunStatusCancelled, &Failure{Stage: FailureStageCancellation, Err: ctx.Err()})

		case <-captureCtx.Done():
			status, failure := captureTerminalResult(ctx, captureCtx, captureCtx.Err())
			return finish(status, failure)
		}
	}
}

func (c *Coordinator) finishAfterCapture(
	ctx context.Context,
	emitter *eventEmitter,
	status RunStatus,
	failure *Failure,
) error {
	status = terminalStatus(ctx, status)
	if status == RunStatusCancelled {
		failure = &Failure{Stage: FailureStageCancellation, Err: ctx.Err()}
	}
	failure = terminalFailure(status, failure)
	emitter.emit(Event{Kind: EventFinished, Status: status, Failure: failure})
	return nil
}

type eventEmitter struct {
	runID    RunID
	sequence uint64
	terminal bool
	sink     EventSink
}

func (e *eventEmitter) emit(event Event) {
	if e.terminal {
		return
	}

	e.sequence++
	event.RunID = e.runID
	event.Sequence = e.sequence
	if event.Kind == EventFinished {
		e.terminal = true
	}
	if e.sink != nil {
		e.sink(event)
	}
}

func terminalStatus(ctx context.Context, status RunStatus) RunStatus {
	if ctx.Err() != nil {
		return RunStatusCancelled
	}
	return status
}

func terminalFailure(status RunStatus, failure *Failure) *Failure {
	if failure == nil {
		return nil
	}

	if status == RunStatusFailed {
		return failure
	}
	if status == RunStatusTimedOut && failure.Stage == FailureStageTimeout {
		return failure
	}
	if status == RunStatusCancelled && failure.Stage == FailureStageCancellation {
		return failure
	}
	return nil
}

func captureTerminalResult(ctx, captureCtx context.Context, captureErr error) (RunStatus, *Failure) {
	status := captureTerminalStatus(ctx, captureCtx, captureErr)
	switch status {
	case RunStatusCancelled:
		return status, &Failure{Stage: FailureStageCancellation, Err: ctx.Err()}
	case RunStatusTimedOut:
		return status, &Failure{Stage: FailureStageTimeout, Err: captureCtx.Err()}
	case RunStatusFailed:
		return status, captureFailure(captureErr)
	default:
		return status, nil
	}
}

func captureTerminalStatus(ctx, captureCtx context.Context, captureErr error) RunStatus {
	if ctx.Err() != nil {
		return RunStatusCancelled
	}
	if errors.Is(captureErr, context.DeadlineExceeded) || errors.Is(captureCtx.Err(), context.DeadlineExceeded) {
		return RunStatusTimedOut
	}
	if errors.Is(captureErr, context.Canceled) {
		return RunStatusCancelled
	}
	if captureErr == nil {
		return RunStatusCompleted
	}
	return RunStatusFailed
}

func publishTerminalStatus(ctx, captureCtx context.Context, publishErr error) (RunStatus, *Failure) {
	if ctx.Err() != nil {
		return RunStatusCancelled, &Failure{Stage: FailureStageCancellation, Err: ctx.Err()}
	}
	if errors.Is(publishErr, context.DeadlineExceeded) || errors.Is(captureCtx.Err(), context.DeadlineExceeded) {
		return RunStatusTimedOut, &Failure{Stage: FailureStageTimeout, Err: context.DeadlineExceeded}
	}
	if errors.Is(publishErr, context.Canceled) {
		return RunStatusCancelled, &Failure{Stage: FailureStageCancellation, Err: context.Canceled}
	}
	return RunStatusFailed, &Failure{
		Stage: FailureStagePublish,
		Err:   fmt.Errorf("coordinator publishing root message: %w", publishErr),
	}
}

func captureFailure(captureErr error) *Failure {
	if captureErr == nil || errors.Is(captureErr, context.Canceled) || errors.Is(captureErr, context.DeadlineExceeded) {
		return nil
	}

	return &Failure{
		Stage: FailureStageCapture,
		Err:   fmt.Errorf("coordinator capturing records: %w", captureErr),
	}
}

func newCorrelationID() (CorrelationID, error) {
	id, err := uuid.NewRandom()
	if err != nil {
		return "", fmt.Errorf("generate correlation ID: %w", err)
	}

	return CorrelationID(id.String()), nil
}

func hasCorrelationID(record kafka.Record, correlationHeader string, wanted CorrelationID) bool {
	for _, header := range record.Message.Headers {
		if header.Key == correlationHeader && string(header.Value) == string(wanted) {
			return true
		}
	}

	return false
}

func isSameRecord(left, right kafka.Record) bool {
	return left.Message.Topic == right.Message.Topic && left.Partition == right.Partition && left.Offset == right.Offset
}
