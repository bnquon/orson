package runhistory

import (
	"errors"
	"time"
)

const CurrentScenarioSnapshotVersion = 1

var (
	ErrInvalidRun = errors.New("run history entry is invalid")
)

// ScenarioSnapshot is the immutable configuration used for a run. It has no
// connection credentials or UI-only selection state.
type ScenarioSnapshot struct {
	Version            int              `json:"version"`
	ID                 string           `json:"id"`
	Source             string           `json:"source"`
	Reference          string           `json:"reference"`
	DisplayName        string           `json:"displayName"`
	SourceFilename     string           `json:"sourceFilename"`
	RootTopic          string           `json:"rootTopic"`
	MessageKey         string           `json:"messageKey"`
	Payload            string           `json:"payload"`
	Headers            []ScenarioHeader `json:"headers"`
	WatchedTopics      []string         `json:"watchedTopics"`
	CorrelationHeader  string           `json:"correlationHeader"`
	CaptureTimeout     time.Duration    `json:"captureTimeout"`
	Topology           []TopologyEdge   `json:"topology"`
	ConfiguredTopology []TopologyEdge   `json:"configuredTopology"`
}

type ScenarioHeader struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type TopologyEdge struct {
	ID   string `json:"id"`
	From string `json:"from"`
	To   string `json:"to"`
}

// Header and Record retain byte values so persistence does not corrupt binary
// Kafka data. The API adapter converts them to the existing string wire shape.
type Header struct {
	Key   string `json:"key"`
	Value []byte `json:"value"`
}

type Record struct {
	Sequence  uint64    `json:"sequence"`
	Kind      string    `json:"kind"`
	IsRoot    bool      `json:"isRoot"`
	Topic     string    `json:"topic"`
	Key       []byte    `json:"key"`
	Value     []byte    `json:"value"`
	Headers   []Header  `json:"headers"`
	Partition int32     `json:"partition"`
	Offset    int64     `json:"offset"`
	Timestamp time.Time `json:"timestamp"`
}

type TopicStatus struct {
	Topic  string `json:"topic"`
	Status string `json:"status"`
}

type Summary struct {
	RunID          string           `json:"runId"`
	WorkspaceID    string           `json:"workspaceId"`
	Scenario       ScenarioSnapshot `json:"scenario"`
	RootTopic      string           `json:"rootTopic"`
	Status         string           `json:"status"`
	StartedAt      time.Time        `json:"startedAt"`
	FinishedAt     time.Time        `json:"finishedAt"`
	Duration       time.Duration    `json:"duration"`
	EventCount     int              `json:"eventCount"`
	FailureStage   string           `json:"failureStage"`
	FailureMessage string           `json:"failureMessage"`
	ConnectionName string           `json:"connectionName"`
}

type Entry struct {
	Summary
	Records       []Record
	TrackedTopics []TopicStatus
}

func (e Entry) Validate() error {
	if e.RunID == "" || e.WorkspaceID == "" || e.Scenario.Version <= 0 || e.Status == "" {
		return ErrInvalidRun
	}
	if !IsTerminalStatus(e.Status) {
		return ErrInvalidRun
	}
	if e.FinishedAt.IsZero() || e.StartedAt.IsZero() {
		return ErrInvalidRun
	}
	if e.FinishedAt.Before(e.StartedAt) || e.Duration < 0 {
		return ErrInvalidRun
	}
	return nil
}

func IsTerminalStatus(status string) bool {
	switch status {
	case "completed", "timed_out", "cancelled", "failed":
		return true
	default:
		return false
	}
}
