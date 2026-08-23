package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type Header struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type RunRequest struct {
	RootTopic             string   `json:"rootTopic"`
	MessageKey            string   `json:"messageKey"`
	Payload               string   `json:"payload"`
	Headers               []Header `json:"headers"`
	WatchedTopics         []string `json:"watchedTopics"`
	CaptureTimeoutSeconds int      `json:"captureTimeoutSeconds"`
}

func (r RunRequest) Validate() error {
	if strings.TrimSpace(r.RootTopic) == "" {
		return errors.New("root topic is required")
	}

	if len(r.WatchedTopics) == 0 {
		return errors.New("at least one watched topic is required")
	}

	seenTopics := make(map[string]struct{}, len(r.WatchedTopics))
	for index, topic := range r.WatchedTopics {
		topic = strings.TrimSpace(topic)
		if topic == "" {
			return fmt.Errorf("watched topic %d is required", index+1)
		}
		if _, exists := seenTopics[topic]; exists {
			return fmt.Errorf("watched topic %q is duplicated", topic)
		}
		seenTopics[topic] = struct{}{}
	}

	if r.CaptureTimeoutSeconds <= 0 {
		return errors.New("capture timeout must be positive")
	}

	if !json.Valid([]byte(r.Payload)) {
		return errors.New("payload must be valid JSON")
	}

	return nil
}

type EventRecord struct {
	Topic     string   `json:"topic"`
	Key       string   `json:"key"`
	Value     string   `json:"value"`
	Headers   []Header `json:"headers"`
	Partition int32    `json:"partition"`
	Offset    int64    `json:"offset"`
	Timestamp string   `json:"timestamp"`
}

type RunStartData struct {
	RunID string `json:"runId"`
}

type RunStartResponse struct {
	OK    bool          `json:"ok"`
	Data  *RunStartData `json:"data,omitempty"`
	Error *APIError     `json:"error,omitempty"`
}

func RunStartSuccess(runID string) RunStartResponse {
	return RunStartResponse{
		OK:   true,
		Data: &RunStartData{RunID: runID},
	}
}

func RunStartFailure(err *APIError) RunStartResponse {
	return RunStartResponse{
		Error: err,
	}
}

type RunControlResponse struct {
	OK    bool      `json:"ok"`
	Error *APIError `json:"error,omitempty"`
}

func RunControlSuccess() RunControlResponse {
	return RunControlResponse{OK: true}
}

func RunControlFailure(err *APIError) RunControlResponse {
	return RunControlResponse{Error: err}
}

type RunEvent struct {
	RunID    string       `json:"runId"`
	Sequence uint64       `json:"sequence"`
	Kind     string       `json:"kind"`
	Status   string       `json:"status,omitempty"`
	Record   *EventRecord `json:"record,omitempty"`
	Error    *APIError    `json:"error,omitempty"`
}
