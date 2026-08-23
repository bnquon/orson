package main

import (
	"context"
	"log"
	"strings"
	"time"

	"orson/internal/api"
	"orson/internal/kafka"
	"orson/internal/run"
)

const runEventName = "run:event"

// StartRun validates and registers a run, then returns its ID before Kafka
// capture or publishing completes. Runtime failures are delivered as events.
func (a *App) StartRun(request api.RunRequest) api.RunStartResponse {
	if err := request.Validate(); err != nil {
		return api.RunStartFailure(api.NewError(
			"invalid_request",
			"The run configuration is invalid.",
			err.Error(),
			false,
		))
	}

	coordinator, requestContext, runID, apiErr := a.beginRun()
	if apiErr != nil {
		return api.RunStartFailure(apiErr)
	}

	go func() {
		defer a.endRun(runID)
		err := coordinator.Run(requestContext, run.RunRequest{
			RunID: runID,
			RootMessage: kafka.Message{
				Topic:   request.RootTopic,
				Key:     []byte(request.MessageKey),
				Value:   []byte(request.Payload),
				Headers: toKafkaHeaders(request.Headers),
			},
			WatchedTopics:  request.WatchedTopics,
			CaptureTimeout: time.Duration(request.CaptureTimeoutSeconds) * time.Second,
		}, a.emitRunEvent)
		if err != nil {
			log.Printf("run failed before terminal event: %v", err)
		}
	}()

	return api.RunStartSuccess(string(runID))
}

// StopRun requests cancellation of the active run. The terminal state is
// delivered asynchronously through run:event.
func (a *App) StopRun(runID string) api.RunControlResponse {
	runID = strings.TrimSpace(runID)

	a.stateMu.Lock()
	active := a.activeRun
	if active == nil || string(active.id) != runID || active.finished {
		a.stateMu.Unlock()
		return api.RunControlFailure(api.NewError(
			"run_not_active",
			"That run is no longer active.",
			"Start a new run before trying to stop it.",
			false,
		))
	}
	active.cancel()
	a.stateMu.Unlock()

	return api.RunControlSuccess()
}

func (a *App) emitRunEvent(event run.Event) {
	payload := api.RunEvent{
		RunID:    string(event.RunID),
		Sequence: event.Sequence,
		Kind:     string(event.Kind),
		Status:   string(event.Status),
	}
	if event.Record != nil {
		record := toAPIRecord(*event.Record)
		payload.Record = &record
	}
	if event.Failure != nil {
		payload.Error = runFailureAPIError(event.Failure)
	}

	a.stateMu.Lock()
	if event.Kind == run.EventFinished && a.activeRun != nil && a.activeRun.id == event.RunID {
		a.activeRun.finished = true
	}
	ctx := a.ctx
	emitter := a.emitEvent
	a.stateMu.Unlock()
	if ctx == nil {
		ctx = context.Background()
	}
	if emitter != nil {
		emitter(ctx, runEventName, payload)
	}
}

func runFailureAPIError(failure *run.Failure) *api.APIError {
	if failure == nil {
		return nil
	}

	code := "run_failed"
	message := "The event run could not be completed."
	switch failure.Stage {
	case run.FailureStageTimeout, run.FailureStageCancellation:
		return nil
	case run.FailureStagePublish:
		code = "publish_failed"
		message = "The root event could not be published."
	case run.FailureStageCapture:
		code = "capture_failed"
		message = "Kafka capture could not be completed."
	case run.FailureStageProcessing:
		code = "processing_failed"
		message = "The event run could not be processed."
	}

	details := failure.Error()
	return api.NewError(code, message, details, true)
}

func toKafkaHeaders(headers []api.Header) []kafka.Header {
	converted := make([]kafka.Header, 0, len(headers))
	for _, header := range headers {
		converted = append(converted, kafka.Header{
			Key:   header.Key,
			Value: []byte(header.Value),
		})
	}

	return converted
}

func toAPIRecord(record kafka.Record) api.EventRecord {
	headers := make([]api.Header, 0, len(record.Message.Headers))
	for _, header := range record.Message.Headers {
		headers = append(headers, api.Header{
			Key:   header.Key,
			Value: string(header.Value),
		})
	}

	return api.EventRecord{
		Topic:     record.Message.Topic,
		Key:       string(record.Message.Key),
		Value:     string(record.Message.Value),
		Headers:   headers,
		Partition: record.Partition,
		Offset:    record.Offset,
		Timestamp: record.Timestamp.UTC().Format(time.RFC3339Nano),
	}
}
