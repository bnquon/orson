//go:build integration

package kafka

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestKafkaIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := Connect(ctx, DefaultConfig())
	if err != nil {
		t.Fatalf("Connect() failed: %v", err)
	}
	defer client.Close()

	t.Run("lists topics", func(t *testing.T) {
		topics, err := client.ListTopics(ctx)
		if err != nil {
			t.Fatalf("ListTopics() failed: %v", err)
		}

		for _, topic := range topics {
			t.Logf("topic=%s internal=%t partitions=%d", topic.Name, topic.Internal, len(topic.Partitions))
		}
	})

	t.Run("reads end offsets", func(t *testing.T) {
		watchedTopics := []string{"order.created", "payment.charged"}
		offsets, err := client.ReadEndOffsets(ctx, watchedTopics)
		if err != nil {
			t.Fatalf("ReadEndOffsets() failed: %v", err)
		}

		if len(offsets) != len(watchedTopics) {
			t.Fatalf("ReadEndOffsets() returned %d offsets, want %d", len(offsets), len(watchedTopics))
		}

		for _, offset := range offsets {
			if offset.Offset < 0 {
				t.Fatalf("offset for %s partition %d = %d, want non-negative value", offset.Topic, offset.Partition, offset.Offset)
			}

			t.Logf("topic=%s partition=%d end_offset=%d", offset.Topic, offset.Partition, offset.Offset)
		}
	})

	t.Run("publishes a message with headers", func(t *testing.T) {
		correlationID := "integration-publish-001"
		message := Message{
			Topic: "orson.integration.publish",
			Value: []byte(`{"event":"integration-test"}`),
			Headers: []Header{
				{
					Key:   "x-correlation-id",
					Value: []byte(correlationID),
				},
			},
		}

		published, err := client.PublishMessage(ctx, message)
		if err != nil {
			t.Fatalf("PublishMessage() failed: %v", err)
		}

		if published.Partition < 0 {
			t.Fatalf("published partition = %d, want non-negative value", published.Partition)
		}
		if published.Offset < 0 {
			t.Fatalf("published offset = %d, want non-negative value", published.Offset)
		}

		t.Logf("topic=%s partition=%d offset=%d correlation_id=%s", published.Message.Topic, published.Partition, published.Offset, correlationID)
	})

	t.Run("captures a newly published message from an offset", func(t *testing.T) {
		topic := "orson.integration.publish"
		correlationID := fmt.Sprintf("integration-capture-%d", time.Now().UnixNano())
		value := []byte(fmt.Sprintf(`{"event":"capture-test","id":"%s"}`, correlationID))

		startingOffsets, err := client.ReadEndOffsets(ctx, []string{topic})
		if err != nil {
			t.Fatalf("ReadEndOffsets() failed: %v", err)
		}

		captureCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()

		captureComplete := errors.New("capture complete")
		capturedRecords := make(chan Record, 1)
		readerErrors := make(chan error, 1)

		go func() {
			err := client.ReadFromOffsets(captureCtx, startingOffsets, func() {}, func(record Record) error {
				for _, header := range record.Message.Headers {
					if header.Key == "x-correlation-id" && string(header.Value) == correlationID {
						capturedRecords <- record
						return captureComplete
					}
				}

				return nil
			})
			readerErrors <- err
		}()

		published, err := client.PublishMessage(ctx, Message{
			Topic: topic,
			Value: value,
			Headers: []Header{
				{
					Key:   "x-correlation-id",
					Value: []byte(correlationID),
				},
			},
		})
		if err != nil {
			cancel()
			<-readerErrors
			t.Fatalf("PublishMessage() failed: %v", err)
		}

		var captured Record
		select {
		case captured = <-capturedRecords:
		case err := <-readerErrors:
			t.Fatalf("ReadFromOffsets() stopped before capturing message: %v", err)
		case <-captureCtx.Done():
			t.Fatalf("timed out waiting for captured message: %v", captureCtx.Err())
		}

		if err := <-readerErrors; !errors.Is(err, captureComplete) {
			t.Fatalf("ReadFromOffsets() error = %v, want capture completion error", err)
		}

		if captured.Message.Topic != topic {
			t.Fatalf("captured topic = %q, want %q", captured.Message.Topic, topic)
		}
		if string(captured.Message.Value) != string(value) {
			t.Fatalf("captured value = %q, want %q", captured.Message.Value, value)
		}
		if captured.Partition != published.Partition {
			t.Fatalf("captured partition = %d, published partition = %d", captured.Partition, published.Partition)
		}
		if captured.Offset != published.Offset {
			t.Fatalf("captured offset = %d, published offset = %d", captured.Offset, published.Offset)
		}

		foundCorrelationID := false
		for _, header := range captured.Message.Headers {
			if header.Key == "x-correlation-id" && string(header.Value) == correlationID {
				foundCorrelationID = true
				break
			}
		}
		if !foundCorrelationID {
			t.Fatalf("captured message did not contain correlation ID %q", correlationID)
		}
	})

	t.Run("reports topic metadata errors", func(t *testing.T) {
		missingTopic := fmt.Sprintf("orson.integration.missing.%d", time.Now().UnixNano())
		_, err := client.listTopics(ctx, missingTopic)
		if err == nil {
			t.Fatalf("listTopics(%q) returned nil error", missingTopic)
		}
		if !strings.Contains(err.Error(), missingTopic) {
			t.Fatalf("error %q does not mention topic %q", err, missingTopic)
		}
	})
}
