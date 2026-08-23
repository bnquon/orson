package run

import (
	"context"
	"testing"
	"time"

	"orson/internal/kafka"
)

func TestCoordinatorRunUsesTimeoutAndExcludesRootRecord(t *testing.T) {
	client := &coordinatorKafkaClient{
		published: make(chan struct{}),
	}
	coordinator, err := NewCoordinator(client)
	if err != nil {
		t.Fatalf("NewCoordinator() failed: %v", err)
	}

	result, err := coordinator.Run(context.Background(), RunRequest{
		RootMessage: kafka.Message{
			Topic: "order.created",
			Value: []byte("root"),
		},
		WatchedTopics:  []string{"order.created", "payment.charged"},
		CaptureTimeout: 100 * time.Millisecond,
	})
	if err != nil {
		t.Fatalf("Run() failed: %v", err)
	}

	if result.CorrelationID == "" {
		t.Fatal("Run() returned an empty correlation ID")
	}
	if len(result.Records) != 1 {
		t.Fatalf("Run() returned %d records, want 1 downstream record", len(result.Records))
	}
	if result.Records[0].Message.Topic != "payment.charged" {
		t.Fatalf("captured topic = %q, want payment.charged", result.Records[0].Message.Topic)
	}

	if len(client.publishedMessage.Headers) != 1 {
		t.Fatalf("published message has %d headers, want 1", len(client.publishedMessage.Headers))
	}
	if client.publishedMessage.Headers[0].Key != CorrelationIDHeader {
		t.Fatalf("published header key = %q, want %q", client.publishedMessage.Headers[0].Key, CorrelationIDHeader)
	}
	if string(client.publishedMessage.Headers[0].Value) != string(result.CorrelationID) {
		t.Fatalf("published correlation ID = %q, want %q", client.publishedMessage.Headers[0].Value, result.CorrelationID)
	}
}

type coordinatorKafkaClient struct {
	published        chan struct{}
	publishedMessage kafka.Message
}

func (c *coordinatorKafkaClient) ReadEndOffsets(context.Context, []string) ([]kafka.PartitionOffset, error) {
	return []kafka.PartitionOffset{{
		Topic:     "order.created",
		Partition: 0,
		Offset:    10,
	}}, nil
}

func (c *coordinatorKafkaClient) PublishMessage(_ context.Context, message kafka.Message) (kafka.Record, error) {
	c.publishedMessage = message
	close(c.published)

	return kafka.Record{
		Message:   message,
		Partition: 0,
		Offset:    10,
	}, nil
}

func (c *coordinatorKafkaClient) ReadFromOffsets(
	ctx context.Context,
	_ []kafka.PartitionOffset,
	onRecord func(kafka.Record) error,
) error {
	<-c.published

	if err := onRecord(kafka.Record{
		Message:   c.publishedMessage,
		Partition: 0,
		Offset:    10,
	}); err != nil {
		return err
	}

	if err := onRecord(kafka.Record{
		Message: kafka.Message{
			Topic:   "payment.charged",
			Value:   []byte("downstream"),
			Headers: c.publishedMessage.Headers,
		},
		Partition: 0,
		Offset:    11,
	}); err != nil {
		return err
	}

	<-ctx.Done()
	return ctx.Err()
}

var _ KafkaClient = (*coordinatorKafkaClient)(nil)
