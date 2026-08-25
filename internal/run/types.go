package run

import (
	"context"
	"errors"
	"time"

	"orson/internal/kafka"

	"github.com/google/uuid"
)

// KafkaClient is the part of the Kafka module needed by the run coordinator.
// Keeping this interface small gives the coordinator a clear seam for tests.
type KafkaClient interface {
	ReadEndOffsets(context.Context, []string) ([]kafka.PartitionOffset, error)
	PublishMessage(context.Context, kafka.Message) (kafka.Record, error)
	ReadFromOffsets(context.Context, []kafka.PartitionOffset, func(), func(kafka.Record) error) error
}

type RunRequest struct {
	RunID             RunID
	RootMessage       kafka.Message
	CorrelationHeader string
	WatchedTopics     []string
	CaptureTimeout    time.Duration
}

type CorrelationID string

type RunID string

func NewRunID() (RunID, error) {
	id, err := uuid.NewRandom()
	if err != nil {
		return "", err
	}

	return RunID(id.String()), nil
}

type EventKind string

const (
	EventStarted       EventKind = "started"
	EventReady         EventKind = "ready"
	EventRootPublished EventKind = "root_published"
	EventMessage       EventKind = "message"
	EventFinished      EventKind = "finished"
)

type RunStatus string

const (
	RunStatusStarting   RunStatus = "starting"
	RunStatusInProgress RunStatus = "in_progress"
	RunStatusCompleted  RunStatus = "completed"
	RunStatusTimedOut   RunStatus = "timed_out"
	RunStatusCancelled  RunStatus = "cancelled"
	RunStatusFailed     RunStatus = "failed"
)

type FailureStage string

const (
	FailureStageCapture      FailureStage = "capture"
	FailureStagePublish      FailureStage = "publish"
	FailureStageProcessing   FailureStage = "processing"
	FailureStageTimeout      FailureStage = "timeout"
	FailureStageCancellation FailureStage = "cancellation"
)

type Failure struct {
	Stage FailureStage
	Err   error
}

func (f *Failure) Error() string {
	if f == nil || f.Err == nil {
		return "run failure"
	}

	return f.Err.Error()
}

func (f *Failure) Unwrap() error {
	if f == nil {
		return nil
	}

	return f.Err
}

type Event struct {
	RunID    RunID
	Sequence uint64
	Kind     EventKind
	Status   RunStatus
	Record   *kafka.Record
	Failure  *Failure
}

type EventSink func(Event)

var ErrMissingRunID = errors.New("run ID is required")
