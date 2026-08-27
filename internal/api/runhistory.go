package api

import (
	"strconv"
	"time"

	"orson/internal/runhistory"
)

type RunHistorySummary struct {
	RunID          string `json:"runId"`
	ScenarioID     string `json:"scenarioId,omitempty"`
	ScenarioSource string `json:"scenarioSource"`
	ScenarioRef    string `json:"scenarioReference"`
	ScenarioName   string `json:"scenarioName"`
	RootTopic      string `json:"rootTopic"`
	Status         string `json:"status"`
	StartedAt      string `json:"startedAt"`
	FinishedAt     string `json:"finishedAt"`
	DurationMs     int64  `json:"durationMs"`
	EventCount     int    `json:"eventCount"`
	FailureStage   string `json:"failureStage,omitempty"`
	FailureMessage string `json:"failureMessage,omitempty"`
	ConnectionName string `json:"connectionName,omitempty"`
	Outcome        string `json:"outcome"`
}

type RunHistoryScenarioSnapshot struct {
	Version            int                    `json:"version"`
	ID                 string                 `json:"id,omitempty"`
	Source             ScenarioSource         `json:"source"`
	Reference          string                 `json:"reference"`
	DisplayName        string                 `json:"displayName"`
	SourceFilename     string                 `json:"sourceFilename,omitempty"`
	RootTopic          string                 `json:"rootTopic"`
	MessageKey         string                 `json:"messageKey"`
	Payload            string                 `json:"payload"`
	Headers            []Header               `json:"headers"`
	WatchedTopics      []string               `json:"watchedTopics"`
	CorrelationHeader  string                 `json:"correlationHeader"`
	CaptureTimeoutSec  int                    `json:"captureTimeoutSeconds"`
	Topology           []ScenarioTopologyEdge `json:"topology"`
	ConfiguredTopology []ScenarioTopologyEdge `json:"configuredTopology,omitempty"`
}

type RunHistoryRecord struct {
	Sequence  uint64   `json:"sequence"`
	Kind      string   `json:"kind"`
	IsRoot    bool     `json:"isRoot"`
	Topic     string   `json:"topic"`
	Key       string   `json:"key"`
	Value     string   `json:"value"`
	Headers   []Header `json:"headers"`
	Partition int32    `json:"partition"`
	Offset    string   `json:"offset"`
	Timestamp string   `json:"timestamp"`
}

type RunHistoryTopicStatus struct {
	Topic  string `json:"topic"`
	Status string `json:"status"`
}

type RunHistoryListData struct {
	Runs []RunHistorySummary `json:"runs"`
}

type RunHistoryData struct {
	Summary       RunHistorySummary          `json:"summary"`
	Scenario      RunHistoryScenarioSnapshot `json:"scenario"`
	Records       []RunHistoryRecord         `json:"records"`
	TrackedTopics []RunHistoryTopicStatus    `json:"trackedTopics"`
}

type RunHistoryListResponse struct {
	OK    bool                `json:"ok"`
	Data  *RunHistoryListData `json:"data,omitempty"`
	Error *APIError           `json:"error,omitempty"`
}

type RunHistoryResponse struct {
	OK    bool            `json:"ok"`
	Data  *RunHistoryData `json:"data,omitempty"`
	Error *APIError       `json:"error,omitempty"`
}

type RunHistoryActionResponse struct {
	OK    bool      `json:"ok"`
	Error *APIError `json:"error,omitempty"`
}

func RunHistoryListSuccess(data RunHistoryListData) RunHistoryListResponse {
	return RunHistoryListResponse{OK: true, Data: &data}
}

func RunHistoryListFailure(err *APIError) RunHistoryListResponse {
	return RunHistoryListResponse{Error: err}
}

func RunHistorySuccess(data RunHistoryData) RunHistoryResponse {
	return RunHistoryResponse{OK: true, Data: &data}
}

func RunHistoryFailure(err *APIError) RunHistoryResponse {
	return RunHistoryResponse{Error: err}
}

func RunHistoryActionSuccess() RunHistoryActionResponse {
	return RunHistoryActionResponse{OK: true}
}

func RunHistoryActionFailure(err *APIError) RunHistoryActionResponse {
	return RunHistoryActionResponse{Error: err}
}

func RunHistorySummaryFromDomain(summary runhistory.Summary) RunHistorySummary {
	outcome := "run completed"
	switch summary.Status {
	case "completed":
		outcome = strconv.Itoa(summary.EventCount) + " events captured"
	case "timed_out":
		outcome = "timed out after " + summary.Duration.Round(time.Second).String()
	case "cancelled":
		outcome = "cancelled"
	case "failed":
		if summary.FailureStage == "publish" {
			outcome = "publish failed"
		} else if summary.FailureMessage != "" {
			outcome = summary.FailureMessage
		} else {
			outcome = "run failed"
		}
	}
	return RunHistorySummary{
		RunID:          summary.RunID,
		ScenarioID:     summary.Scenario.ID,
		ScenarioSource: summary.Scenario.Source,
		ScenarioRef:    summary.Scenario.Reference,
		ScenarioName:   summary.Scenario.DisplayName,
		RootTopic:      summary.RootTopic,
		Status:         summary.Status,
		StartedAt:      formatRunHistoryTime(summary.StartedAt),
		FinishedAt:     formatRunHistoryTime(summary.FinishedAt),
		DurationMs:     summary.Duration.Milliseconds(),
		EventCount:     summary.EventCount,
		FailureStage:   summary.FailureStage,
		FailureMessage: summary.FailureMessage,
		ConnectionName: summary.ConnectionName,
		Outcome:        outcome,
	}
}

func RunHistoryDataFromDomain(entry runhistory.Entry) RunHistoryData {
	data := RunHistoryData{
		Summary:       RunHistorySummaryFromDomain(entry.Summary),
		Scenario:      scenarioSnapshotFromDomain(entry.Scenario),
		Records:       make([]RunHistoryRecord, 0, len(entry.Records)),
		TrackedTopics: make([]RunHistoryTopicStatus, 0, len(entry.TrackedTopics)),
	}
	for _, record := range entry.Records {
		headers := make([]Header, 0, len(record.Headers))
		for _, header := range record.Headers {
			headers = append(headers, Header{Key: header.Key, Value: string(header.Value)})
		}
		data.Records = append(data.Records, RunHistoryRecord{
			Sequence: record.Sequence, Kind: record.Kind, IsRoot: record.IsRoot,
			Topic: record.Topic, Key: string(record.Key), Value: string(record.Value),
			Headers: headers, Partition: record.Partition, Offset: strconv.FormatInt(record.Offset, 10),
			Timestamp: formatRunHistoryTime(record.Timestamp),
		})
	}
	for _, topic := range entry.TrackedTopics {
		data.TrackedTopics = append(data.TrackedTopics, RunHistoryTopicStatus{Topic: topic.Topic, Status: topic.Status})
	}
	return data
}

func scenarioSnapshotFromDomain(snapshot runhistory.ScenarioSnapshot) RunHistoryScenarioSnapshot {
	headers := make([]Header, 0, len(snapshot.Headers))
	for _, header := range snapshot.Headers {
		headers = append(headers, Header{Key: header.Key, Value: header.Value})
	}
	return RunHistoryScenarioSnapshot{
		Version: snapshot.Version, ID: snapshot.ID, Source: ScenarioSource(snapshot.Source),
		Reference: snapshot.Reference, DisplayName: snapshot.DisplayName,
		SourceFilename: snapshot.SourceFilename, RootTopic: snapshot.RootTopic,
		MessageKey: snapshot.MessageKey, Payload: snapshot.Payload, Headers: headers,
		WatchedTopics:     append([]string(nil), snapshot.WatchedTopics...),
		CorrelationHeader: snapshot.CorrelationHeader,
		CaptureTimeoutSec: int(snapshot.CaptureTimeout / time.Second),
		Topology:          topologyFromDomain(snapshot.Topology), ConfiguredTopology: topologyFromDomain(snapshot.ConfiguredTopology),
	}
}

func topologyFromDomain(edges []runhistory.TopologyEdge) []ScenarioTopologyEdge {
	result := make([]ScenarioTopologyEdge, 0, len(edges))
	for _, edge := range edges {
		result = append(result, ScenarioTopologyEdge{ID: edge.ID, From: edge.From, To: edge.To})
	}
	return result
}

func formatRunHistoryTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339Nano)
}
