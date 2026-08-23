package kafka

import (
	"context"
	"errors"
	"fmt"
)

type PartitionOffset struct {
	Topic     string
	Partition int32
	Offset    int64
}

func (c *Client) ReadEndOffsets(ctx context.Context, watchedTopics []string) ([]PartitionOffset, error) {
	if len(watchedTopics) == 0 {
		return nil, errors.New("at least one watched topic is required")
	}

	listedOffsets, err := c.admin.ListEndOffsets(ctx, watchedTopics...)
	if err != nil {
		return nil, fmt.Errorf("read end offsets: %w", err)
	}

	if err := listedOffsets.Error(); err != nil {
		return nil, fmt.Errorf("read end offsets: %w", err)
	}

	var offsets []PartitionOffset

	for _, offset := range listedOffsets.Offsets().Sorted() {
		offsets = append(offsets, PartitionOffset{
			Topic:     offset.Topic,
			Partition: offset.Partition,
			Offset:    offset.At,
		})
	}

	return offsets, nil
}
