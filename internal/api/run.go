package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"orson/internal/correlation"
)

const maxCaptureTimeoutSeconds = int64((1<<63 - 1) / int64(time.Second))

type Header struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type RunRequest struct {
	RootTopic             string               `json:"rootTopic"`
	MessageKey            string               `json:"messageKey"`
	Payload               string               `json:"payload"`
	Headers               []Header             `json:"headers"`
	CorrelationHeader     string               `json:"correlationHeader"`
	WatchedTopics         []string             `json:"watchedTopics"`
	CaptureTimeoutSeconds int                  `json:"captureTimeoutSeconds"`
	ScenarioSnapshot      *RunScenarioSnapshot `json:"scenarioSnapshot,omitempty"`
}

// Normalize returns a copy with canonical topic names. Watched topics retain
// their first-seen order so preflight, capture, and history share one request.
func (r RunRequest) Normalize() RunRequest {
	normalized := r
	normalized.RootTopic = strings.TrimSpace(r.RootTopic)
	normalized.WatchedTopics = normalizeTopics(r.WatchedTopics)
	if r.ScenarioSnapshot != nil {
		snapshot := *r.ScenarioSnapshot
		snapshot.RootTopic = strings.TrimSpace(r.ScenarioSnapshot.RootTopic)
		snapshot.WatchedTopics = normalizeTopics(r.ScenarioSnapshot.WatchedTopics)
		normalized.ScenarioSnapshot = &snapshot
	}

	return normalized
}

func normalizeTopics(topics []string) []string {
	normalized := make([]string, 0, len(topics))
	seen := make(map[string]struct{}, len(topics))
	for _, topic := range topics {
		topic = strings.TrimSpace(topic)
		if _, exists := seen[topic]; exists {
			continue
		}
		seen[topic] = struct{}{}
		normalized = append(normalized, topic)
	}
	return normalized
}

// RunScenarioSnapshot carries the exact editable scenario configuration used
// for a run so durable history does not depend on the current YAML file.
type RunScenarioSnapshot struct {
	Version            int                    `json:"version"`
	Source             ScenarioSource         `json:"source"`
	ScenarioID         string                 `json:"scenarioId"`
	SourcePath         string                 `json:"sourcePath"`
	SourceFilename     string                 `json:"sourceFilename"`
	DisplayName        string                 `json:"displayName"`
	RootTopic          string                 `json:"rootTopic"`
	WatchedTopics      []string               `json:"watchedTopics"`
	Topology           []ScenarioTopologyEdge `json:"topology"`
	ConfiguredTopology []ScenarioTopologyEdge `json:"configuredTopology"`
	MessageKey         string                 `json:"messageKey"`
	Headers            []Header               `json:"headers"`
	CorrelationHeader  string                 `json:"correlationHeader"`
	Payload            string                 `json:"payload"`
	CaptureTimeoutSec  int                    `json:"captureTimeoutSeconds"`
}

func (r RunRequest) ResolvedCorrelationHeader() string {
	return correlation.ResolveHeader(r.CorrelationHeader)
}

func (r RunRequest) Validate() error {
	if strings.TrimSpace(r.RootTopic) == "" {
		return errors.New("root topic is required")
	}

	if len(r.WatchedTopics) == 0 {
		return errors.New("at least one watched topic is required")
	}

	for index, topic := range r.WatchedTopics {
		if strings.TrimSpace(topic) == "" {
			return fmt.Errorf("watched topic %d is required", index+1)
		}
	}

	if r.CaptureTimeoutSeconds <= 0 {
		return errors.New("capture timeout must be positive")
	}
	if int64(r.CaptureTimeoutSeconds) > maxCaptureTimeoutSeconds {
		return errors.New("capture timeout is too large")
	}

	if !json.Valid([]byte(r.Payload)) {
		return errors.New("payload must be valid JSON")
	}

	correlationHeader := r.ResolvedCorrelationHeader()
	for index, header := range r.Headers {
		if strings.TrimSpace(header.Key) == "" {
			return fmt.Errorf("header %d name is required", index+1)
		}
		if correlation.HeaderNamesEqual(header.Key, correlationHeader) {
			return fmt.Errorf(
				"header %q is managed automatically by Orson and must be removed from custom headers",
				correlationHeader,
			)
		}
	}

	return nil
}

type EventRecord struct {
	Topic     string   `json:"topic"`
	Key       string   `json:"key"`
	Value     string   `json:"value"`
	Headers   []Header `json:"headers"`
	Partition int32    `json:"partition"`
	Offset    string   `json:"offset"`
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
