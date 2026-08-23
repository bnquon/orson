package run

import (
	"context"
	"time"

	"orson/internal/kafka"
)

// KafkaClient is the part of the Kafka module needed by the run coordinator.
// Keeping this interface small gives the coordinator a clear seam for tests.
type KafkaClient interface {
	ReadEndOffsets(context.Context, []string) ([]kafka.PartitionOffset, error)
	PublishMessage(context.Context, kafka.Message) (kafka.Record, error)
	ReadFromOffsets(context.Context, []kafka.PartitionOffset, func(kafka.Record) error) error
}

type RunRequest struct {
	RootMessage    kafka.Message
	WatchedTopics  []string
	CaptureTimeout time.Duration
}

type RunResult struct {
	CorrelationID CorrelationID
	RootRecord    kafka.Record
	Records       []kafka.Record
}
