package kafka

import (
	"context"
	"errors"
	"fmt"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
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

// TopicMetadata preserves per-topic failures so callers can report all missing topics.
type TopicMetadata struct {
	Name    string
	Missing bool
	Err     error
}

func (c *Client) LookupTopics(ctx context.Context, names []string) ([]TopicMetadata, error) {
	// kadm.Metadata issues a fresh request (cache max age zero), with
	// AllowAutoTopicCreation false, including when the broker permits creation.
	metadata, err := c.admin.Metadata(ctx, names...)
	if err != nil {
		return nil, fmt.Errorf("lookup topic metadata: %w", err)
	}
	return topicMetadataResults(metadata.Topics, names), nil
}

func topicMetadataResults(topics kadm.TopicDetails, names []string) []TopicMetadata {
	results := make([]TopicMetadata, 0, len(names))
	for _, name := range names {
		topic, ok := topics[name]
		result := TopicMetadata{Name: name}
		switch {
		case !ok:
			result.Err = errors.New("broker omitted requested topic metadata")
		case errors.Is(topic.Err, kerr.UnknownTopicOrPartition):
			result.Missing = true
		case topic.Err != nil:
			result.Err = topic.Err
		default:
			for _, partition := range topic.Partitions.Sorted() {
				if partition.Err != nil {
					result.Err = partition.Err
					break
				}
			}
			if len(topic.Partitions) == 0 {
				result.Err = errors.New("topic metadata has no partitions")
			}
		}
		results = append(results, result)
	}
	return results
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
