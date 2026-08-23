package kafka

import (
	"context"
	"errors"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"
)

// ReadFromOffsets consumes records from the supplied starting offsets until
// ctx is canceled or the callback returns an error.
func (c *Client) ReadFromOffsets(
	ctx context.Context,
	startingOffsets []PartitionOffset,
	onRecord func(Record) error,
) error {
	if len(startingOffsets) == 0 {
		return errors.New("at least one starting offset is required")
	}

	if onRecord == nil {
		return errors.New("record callback is required")
	}

	partitions := make(map[string]map[int32]kgo.Offset)

	for _, startingOffset := range startingOffsets {
		if startingOffset.Topic == "" {
			return errors.New("starting offset topic empty")
		}

		if startingOffset.Partition < 0 {
			return fmt.Errorf(
				"starting offset for topic %q has invalid partition %d",
				startingOffset.Topic,
				startingOffset.Partition,
			)
		}

		if startingOffset.Offset < 0 {
			return fmt.Errorf(
				"starting offset for topic %q partition %d is negative",
				startingOffset.Topic,
				startingOffset.Partition,
			)
		}

		if partitions[startingOffset.Topic] == nil {
			partitions[startingOffset.Topic] = make(map[int32]kgo.Offset)
		}

		partitions[startingOffset.Topic][startingOffset.Partition] =
			kgo.NewOffset().At(startingOffset.Offset)
	}

	// AddConsumePartitions tells franz-go exactly which partitions to read and
	// the exact offset at which each partition should begin.
	c.franz.AddConsumePartitions(partitions)

	consumePartitions := make(map[string][]int32, len(partitions))
	for topic, topicPartitions := range partitions {
		for partition := range topicPartitions {
			consumePartitions[topic] = append(consumePartitions[topic], partition)
		}
	}
	// TODO: Use a dedicated franz client per capture session when concurrent
	// coordinator runs need to be supported.
	defer c.franz.RemoveConsumePartitions(consumePartitions)

	for {
		fetches := c.franz.PollFetches(ctx)

		for _, fetchError := range fetches.Errors() {
			if errors.Is(fetchError.Err, context.Canceled) ||
				errors.Is(fetchError.Err, context.DeadlineExceeded) {
				return ctx.Err()
			}

			return fmt.Errorf(
				"consume topic %q partition %d: %w",
				fetchError.Topic,
				fetchError.Partition,
				fetchError.Err,
			)
		}

		var callbackErr error
		fetches.EachRecord(func(kgoRecord *kgo.Record) {
			if callbackErr != nil {
				return
			}

			callbackErr = onRecord(recordFromKgo(kgoRecord))
		})

		if callbackErr != nil {
			return fmt.Errorf("handle consumed record: %w", callbackErr)
		}
	}
}

func recordFromKgo(record *kgo.Record) Record {
	headers := make([]Header, 0, len(record.Headers))
	for _, header := range record.Headers {
		headers = append(headers, Header{
			Key:   header.Key,
			Value: cloneBytes(header.Value),
		})
	}

	return Record{
		Message: Message{
			Topic:   record.Topic,
			Key:     cloneBytes(record.Key),
			Value:   cloneBytes(record.Value),
			Headers: headers,
		},
		Partition: record.Partition,
		Offset:    record.Offset,
		Timestamp: record.Timestamp,
	}
}

func cloneBytes(value []byte) []byte {
	return append([]byte(nil), value...)
}
