package kafka

import (
	"context"
	"fmt"
)

type Topic struct {
	Name       string
	Internal   bool
	Partitions []Partition
}

type Partition struct {
	ID             int32
	LeaderBrokerID int32
}

func (c *Client) ListTopics(ctx context.Context) ([]Topic, error) {
	return c.listTopics(ctx)
}

func (c *Client) listTopics(ctx context.Context, topicNames ...string) ([]Topic, error) {
	var topics []Topic

	metadata, err := c.admin.Metadata(ctx, topicNames...)
	if err != nil {
		return nil, fmt.Errorf("list metadata: %w", err)
	}

	for _, topic := range metadata.Topics.Sorted() {
		if topic.Err != nil {
			return nil, fmt.Errorf("metadata for topic %q: %w", topic.Topic, topic.Err)
		}

		convertedTopic := Topic{
			Name:     topic.Topic,
			Internal: topic.IsInternal,
		}

		for _, partition := range topic.Partitions.Sorted() {
			if partition.Err != nil {
				return nil, fmt.Errorf(
					"metadata for topic %q partition %d: %w",
					topic.Topic,
					partition.Partition,
					partition.Err,
				)
			}

			convertedTopic.Partitions = append(
				convertedTopic.Partitions,
				Partition{
					ID:             partition.Partition,
					LeaderBrokerID: partition.Leader,
				},
			)
		}

		topics = append(topics, convertedTopic)
	}

	return topics, nil
}
