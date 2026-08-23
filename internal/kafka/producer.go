package kafka

import (
	"context"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"
)

func (c *Client) PublishMessage(ctx context.Context, message Message) (Record, error) {
	if message.Topic == "" {
		return Record{}, fmt.Errorf("publish message topic empty")
	}

	kgoRecord := &kgo.Record{
		Topic: message.Topic,
		Key:   message.Key,
		Value: message.Value,
	}

	recordHeaders := make([]kgo.RecordHeader, 0, len(message.Headers))

	for _, header := range message.Headers {
		recordHeaders = append(recordHeaders, kgo.RecordHeader{
			Key:   header.Key,
			Value: header.Value,
		})
	}

	kgoRecord.Headers = recordHeaders

	results := c.franz.ProduceSync(ctx, kgoRecord)

	published, err := results.First()
	if err != nil {
		return Record{}, fmt.Errorf("publish message to %q: %w", message.Topic, err)
	}

	return Record{
		Message:   message,
		Partition: published.Partition,
		Offset:    published.Offset,
		Timestamp: published.Timestamp,
	}, nil
}
