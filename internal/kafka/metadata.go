package kafka

import (
	"context"
	"errors"
	"fmt"

	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
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
	metadata, err := topicMetadataRequest(names).RequestWith(ctx, c.franz)
	if err != nil {
		return nil, fmt.Errorf("lookup topic metadata: %w", err)
	}
	if metadata == nil {
		return nil, errors.New("lookup topic metadata: broker returned an unexpected response")
	}
	return topicMetadataResults(metadata.Topics, names), nil
}

func topicMetadataRequest(names []string) *kmsg.MetadataRequest {
	request := kmsg.NewPtrMetadataRequest()
	request.AllowAutoTopicCreation = false
	request.Topics = make([]kmsg.MetadataRequestTopic, 0, len(names))
	for _, name := range names {
		topic := kmsg.NewMetadataRequestTopic()
		topic.Topic = kmsg.StringPtr(name)
		request.Topics = append(request.Topics, topic)
	}
	return request
}

func topicMetadataResults(topics []kmsg.MetadataResponseTopic, names []string) []TopicMetadata {
	byName := make(map[string]int, len(topics))
	for index, topic := range topics {
		if topic.Topic != nil {
			byName[*topic.Topic] = index
		}
	}

	results := make([]TopicMetadata, 0, len(names))
	for _, name := range names {
		index, ok := byName[name]
		result := TopicMetadata{Name: name}
		if !ok {
			result.Err = errors.New("broker omitted requested topic metadata")
			results = append(results, result)
			continue
		}

		topic := topics[index]
		topicErr := kerr.ErrorForCode(topic.ErrorCode)
		switch {
		case errors.Is(topicErr, kerr.UnknownTopicOrPartition):
			result.Missing = true
		case topicErr != nil:
			result.Err = topicErr
		default:
			for _, partition := range topic.Partitions {
				if partitionErr := kerr.ErrorForCode(partition.ErrorCode); partitionErr != nil {
					result.Err = partitionErr
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
