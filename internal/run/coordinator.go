package run

import (
	"context"
	"errors"
	"fmt"

	"orson/internal/kafka"

	"github.com/google/uuid"
)

const CorrelationIDHeader = "x-correlation-id"

type CorrelationID string

type Coordinator struct {
	kafkaClient KafkaClient
}

func NewCoordinator(kafkaClient KafkaClient) (*Coordinator, error) {
	if kafkaClient == nil {
		return nil, errors.New("kafka client is required")
	}

	return &Coordinator{
		kafkaClient: kafkaClient,
	}, nil
}

// Run will capture the downstream records caused by one root event.
func (c *Coordinator) Run(ctx context.Context, request RunRequest) (RunResult, error) {
	if request.CaptureTimeout <= 0 {
		return RunResult{}, errors.New("capture timeout must be positive")
	}

	// 1. Read end offsets for request.WatchedTopics.
	offsets, err := c.kafkaClient.ReadEndOffsets(ctx, request.WatchedTopics)

	if err != nil {
		return RunResult{}, fmt.Errorf("coordinator reading offsets: %w", err)
	}

	// 2. Generate a correlation ID for this run.
	correlationID, err := newCorrelationID()

	if err != nil {
		return RunResult{}, fmt.Errorf(
			"coordinator generating correlation ID: %w",
			err,
		)
	}

	// 3. Add the correlation ID to the root message.
	rootMessage := request.RootMessage

	rootMessage.Headers = append(
		rootMessage.Headers,
		kafka.Header{
			Key:   CorrelationIDHeader,
			Value: []byte(correlationID),
		},
	)

	// 4. Start capturing from the saved offsets and filter records by ID.
	captureCtx, stopCapture := context.WithTimeout(ctx, request.CaptureTimeout)
	defer stopCapture()

	recordsCh := make(chan kafka.Record, 16)
	captureErrorsCh := make(chan error, 1)

	go func() {
		err := c.kafkaClient.ReadFromOffsets(
			captureCtx,
			offsets,
			func(r kafka.Record) error {
				if !hasCorrelationID(r, correlationID) {
					return nil
				}

				select {
				case recordsCh <- r:
					return nil
				case <-captureCtx.Done():
					return captureCtx.Err()
				}
			},
		)

		captureErrorsCh <- err
	}()

	// 5. Publish the root message after the capture reader is running.
	rootRecord, err := c.kafkaClient.PublishMessage(ctx, rootMessage)

	if err != nil {
		return RunResult{}, fmt.Errorf("coordinator publishing root message: %w", err)
	}

	// 6. Collect matching records until the run is canceled or times out.
	result := RunResult{
		CorrelationID: correlationID,
		RootRecord:    rootRecord,
	}

	for {
		select {
		case record := <-recordsCh:
			result.Records = append(result.Records, record)

		case err := <-captureErrorsCh:
			if err != nil &&
				!errors.Is(err, context.Canceled) &&
				!errors.Is(err, context.DeadlineExceeded) {
				return excludeRootRecord(result), fmt.Errorf(
					"coordinator capturing records: %w",
					err,
				)
			}

			if ctx.Err() != nil {
				return excludeRootRecord(result), ctx.Err()
			}

			return excludeRootRecord(result), nil

		case <-ctx.Done():
			return excludeRootRecord(result), ctx.Err()
		}
	}
}

func newCorrelationID() (CorrelationID, error) {
	id, err := uuid.NewRandom()
	if err != nil {
		return "", fmt.Errorf("generate correlation ID: %w", err)
	}

	return CorrelationID(id.String()), nil
}

func hasCorrelationID(record kafka.Record, wanted CorrelationID) bool {
	for _, header := range record.Message.Headers {
		if header.Key == CorrelationIDHeader &&
			string(header.Value) == string(wanted) {
			return true
		}
	}

	return false
}

func excludeRootRecord(result RunResult) RunResult {
	filtered := make([]kafka.Record, 0, len(result.Records))
	for _, record := range result.Records {
		if isSameRecord(record, result.RootRecord) {
			continue
		}

		filtered = append(filtered, record)
	}

	result.Records = filtered
	return result
}

func isSameRecord(left, right kafka.Record) bool {
	return left.Message.Topic == right.Message.Topic &&
		left.Partition == right.Partition &&
		left.Offset == right.Offset
}
