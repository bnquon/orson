package main

import (
	"context"
	"errors"
	"strings"
	"time"

	"orson/internal/api"
	"orson/internal/run"
	"orson/internal/runhistory"
	"orson/internal/workspace"
)

const runHistoryErrorEventName = "run:history-error"

func (a *App) ListRunHistory(workspaceID string) api.RunHistoryListResponse {
	items, err := a.workspaceService().ListRunHistory(workspaceID)
	if err != nil {
		return api.RunHistoryListFailure(runHistoryAPIError(err))
	}
	result := make([]api.RunHistorySummary, 0, len(items))
	for _, item := range items {
		result = append(result, api.RunHistorySummaryFromDomain(item))
	}
	return api.RunHistoryListSuccess(api.RunHistoryListData{Runs: result})
}

func (a *App) GetRunHistory(id, workspaceID string) api.RunHistoryResponse {
	entry, err := a.workspaceService().GetRunHistory(strings.TrimSpace(id), workspaceID)
	if err != nil {
		return api.RunHistoryFailure(runHistoryAPIError(err))
	}
	return api.RunHistorySuccess(api.RunHistoryDataFromDomain(entry))
}

func (a *App) DeleteRunHistory(id, workspaceID string) api.RunHistoryActionResponse {
	if err := a.workspaceService().DeleteRunHistory(strings.TrimSpace(id), workspaceID); err != nil {
		return api.RunHistoryActionFailure(runHistoryAPIError(err))
	}
	return api.RunHistoryActionSuccess()
}

func (a *App) ClearRunHistory(workspaceID string) api.RunHistoryActionResponse {
	if err := a.workspaceService().ClearRunHistory(workspaceID); err != nil {
		return api.RunHistoryActionFailure(runHistoryAPIError(err))
	}
	return api.RunHistoryActionSuccess()
}

func runHistoryAPIError(err error) *api.APIError {
	switch {
	case errors.Is(err, workspace.ErrRunHistoryNotFound):
		return api.NewError("run_history_not_found", "That saved run is no longer available.", "Refresh run history and choose another run.", false)
	case errors.Is(err, workspace.ErrRunHistoryStaleWorkspace):
		return api.NewError("stale_workspace", "That workspace is no longer active.", "Refresh the workspace before changing run history.", true)
	case errors.Is(err, workspace.ErrRunHistoryUnavailable):
		return api.NewError("run_history_persistence_failed", "Run history could not be accessed.", err.Error(), true)
	case errors.Is(err, workspace.ErrWorkspaceNotFound):
		return workspaceRequiredError()
	default:
		return api.NewError("run_history_failed", "Run history could not be accessed.", err.Error(), true)
	}
}

type runHistoryRecorder struct {
	app           *App
	workspaceID   string
	connection    string
	scenario      runhistory.ScenarioSnapshot
	startedAt     time.Time
	watchedTopics []string
	records       []runhistory.Record
	tracked       map[string]string
}

func newRunHistoryRecorder(app *App, request api.RunRequest, workspaceID, connection string) *runHistoryRecorder {
	snapshot := runhistory.ScenarioSnapshot{
		Version:           runhistory.CurrentScenarioSnapshotVersion,
		Source:            string(api.ScenarioSourceExample),
		RootTopic:         request.RootTopic,
		MessageKey:        request.MessageKey,
		Payload:           request.Payload,
		CorrelationHeader: request.ResolvedCorrelationHeader(),
		WatchedTopics:     append([]string(nil), request.WatchedTopics...),
		CaptureTimeout:    time.Duration(request.CaptureTimeoutSeconds) * time.Second,
	}
	if request.ScenarioSnapshot != nil {
		input := request.ScenarioSnapshot
		snapshot.Version = input.Version
		snapshot.ID = input.ScenarioID
		snapshot.Source = string(input.Source)
		snapshot.Reference = input.SourcePath
		snapshot.DisplayName = input.DisplayName
		snapshot.SourceFilename = input.SourceFilename
		snapshot.RootTopic = input.RootTopic
		snapshot.MessageKey = input.MessageKey
		snapshot.Payload = input.Payload
		snapshot.CorrelationHeader = input.CorrelationHeader
		snapshot.WatchedTopics = append([]string(nil), input.WatchedTopics...)
		snapshot.CaptureTimeout = time.Duration(input.CaptureTimeoutSec) * time.Second
		snapshot.Headers = make([]runhistory.ScenarioHeader, 0, len(input.Headers))
		for _, header := range input.Headers {
			snapshot.Headers = append(snapshot.Headers, runhistory.ScenarioHeader{Key: header.Key, Value: header.Value})
		}
		for _, edge := range input.Topology {
			snapshot.Topology = append(snapshot.Topology, runhistory.TopologyEdge{ID: edge.ID, From: edge.From, To: edge.To})
		}
		for _, edge := range input.ConfiguredTopology {
			snapshot.ConfiguredTopology = append(snapshot.ConfiguredTopology, runhistory.TopologyEdge{ID: edge.ID, From: edge.From, To: edge.To})
		}
	}
	if snapshot.Version == 0 {
		snapshot.Version = runhistory.CurrentScenarioSnapshotVersion
	}
	if snapshot.RootTopic == "" {
		snapshot.RootTopic = request.RootTopic
	}
	if snapshot.DisplayName == "" {
		snapshot.DisplayName = snapshot.RootTopic
	}
	if snapshot.CaptureTimeout <= 0 {
		snapshot.CaptureTimeout = time.Duration(request.CaptureTimeoutSeconds) * time.Second
	}
	tracked := make(map[string]string, len(request.WatchedTopics))
	for _, topic := range request.WatchedTopics {
		topic = strings.TrimSpace(topic)
		if topic != "" {
			tracked[topic] = "in_progress"
		}
	}
	return &runHistoryRecorder{
		app: app, workspaceID: workspaceID, connection: connection, scenario: snapshot,
		startedAt: time.Now().UTC(), watchedTopics: append([]string(nil), request.WatchedTopics...), tracked: tracked,
	}
}

func (r *runHistoryRecorder) sink(event run.Event) {
	if event.Record != nil {
		r.record(event)
	}
	if event.Kind == run.EventFinished {
		r.finish(event)
	}
	r.app.emitRunEvent(event)
}

func (r *runHistoryRecorder) record(event run.Event) {
	record := event.Record
	if record == nil {
		return
	}
	copyRecord := runhistory.Record{
		Sequence: event.Sequence, Kind: string(event.Kind), IsRoot: event.Kind == run.EventRootPublished,
		Topic: record.Message.Topic, Key: cloneBytes(record.Message.Key), Value: cloneBytes(record.Message.Value),
		Partition: record.Partition, Offset: record.Offset, Timestamp: record.Timestamp.UTC(),
	}
	copyRecord.Headers = make([]runhistory.Header, 0, len(record.Message.Headers))
	for _, header := range record.Message.Headers {
		copyRecord.Headers = append(copyRecord.Headers, runhistory.Header{Key: header.Key, Value: cloneBytes(header.Value)})
	}
	r.records = append(r.records, copyRecord)
	if !copyRecord.IsRoot {
		if _, watched := r.tracked[copyRecord.Topic]; watched {
			r.tracked[copyRecord.Topic] = "completed"
		}
	}
}

func (r *runHistoryRecorder) finish(event run.Event) {
	for topic, status := range r.tracked {
		if status != "in_progress" {
			continue
		}
		if event.Status == run.RunStatusFailed && event.Failure != nil && event.Failure.Stage != run.FailureStagePublish {
			r.tracked[topic] = "failed"
		} else {
			r.tracked[topic] = "unwitnessed"
		}
	}
	tracked := make([]runhistory.TopicStatus, 0, len(r.tracked))
	for _, topic := range r.watchedTopics {
		topic = strings.TrimSpace(topic)
		if status, ok := r.tracked[topic]; ok {
			tracked = append(tracked, runhistory.TopicStatus{Topic: topic, Status: status})
			delete(r.tracked, topic)
		}
	}
	for topic, status := range r.tracked {
		tracked = append(tracked, runhistory.TopicStatus{Topic: topic, Status: status})
	}
	finishedAt := time.Now().UTC()
	entry := runhistory.Entry{Summary: runhistory.Summary{
		RunID: string(event.RunID), WorkspaceID: r.workspaceID, Scenario: r.scenario,
		RootTopic: r.scenario.RootTopic, Status: string(event.Status), StartedAt: r.startedAt,
		FinishedAt: finishedAt, Duration: finishedAt.Sub(r.startedAt), EventCount: len(r.records),
		ConnectionName: r.connection,
	}, Records: r.records, TrackedTopics: tracked}
	if event.Failure != nil {
		entry.FailureStage = string(event.Failure.Stage)
		entry.FailureMessage = event.Failure.Error()
	}
	if err := r.app.workspaceService().SaveRunHistory(entry); err != nil {
		r.app.emitHistoryError(err)
	}
}

func (a *App) emitHistoryError(err error) {
	payload := api.NewError("run_history_persistence_failed", "This run could not be saved to local history.", err.Error(), true)
	a.stateMu.Lock()
	ctx := a.ctx
	emitter := a.emitHistoryEvent
	a.stateMu.Unlock()
	if ctx == nil {
		ctx = context.Background()
	}
	if emitter != nil {
		emitter(ctx, runHistoryErrorEventName, payload)
	}
}

func cloneBytes(value []byte) []byte {
	if value == nil {
		return nil
	}
	return append([]byte{}, value...)
}
