package workspace

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"orson/internal/runhistory"
)

func testHistoryEntry(workspaceID, runID string, finishedAt time.Time) runhistory.Entry {
	return runhistory.Entry{
		Summary: runhistory.Summary{
			RunID: runID, WorkspaceID: workspaceID,
			Scenario: runhistory.ScenarioSnapshot{
				Version: runhistory.CurrentScenarioSnapshotVersion, ID: "examples/order.yaml",
				Source: "example", Reference: "examples/order.yaml", DisplayName: "Order flow",
				SourceFilename: "examples/order.yaml", RootTopic: "order.created", MessageKey: "order-1",
				Payload:           `{"orderId":"order-1"}`,
				Headers:           []runhistory.ScenarioHeader{{Key: "content-type", Value: "application/json"}},
				WatchedTopics:     []string{"payment.charged", "inventory.reserved"},
				CorrelationHeader: "x-correlation-id", CaptureTimeout: 10 * time.Second,
				Topology: []runhistory.TopologyEdge{{ID: "edge-1", From: "order.created", To: "payment.charged"}},
			},
			RootTopic: "order.created", Status: "completed", StartedAt: finishedAt.Add(-2 * time.Second),
			FinishedAt: finishedAt, Duration: 2 * time.Second, EventCount: 2,
			ConnectionName: "local Kafka",
		},
		Records: []runhistory.Record{
			{Sequence: 3, Kind: "root_published", IsRoot: true, Topic: "order.created", Key: []byte("order-1"), Value: []byte(`{"orderId":"order-1"}`), Headers: []runhistory.Header{{Key: "x-correlation-id", Value: []byte("corr-1")}}, Partition: 1, Offset: 12, Timestamp: finishedAt.Add(-1500 * time.Millisecond)},
			{Sequence: 4, Kind: "message", Topic: "payment.charged", Value: []byte(`{"paid":true}`), Headers: []runhistory.Header{{Key: "content-type", Value: []byte("application/json")}}, Partition: 2, Offset: 18, Timestamp: finishedAt.Add(-time.Second)},
		},
		TrackedTopics: []runhistory.TopicStatus{{Topic: "payment.charged", Status: "completed"}, {Topic: "inventory.reserved", Status: "unwitnessed"}},
	}
}

func TestRunHistoryRoundTripCopiesRecordsAndHeaders(t *testing.T) {
	service := testService(t)
	workspaceID := service.Snapshot().ActiveWorkspaceID
	entry := testHistoryEntry(workspaceID, "run-1", time.Date(2026, 8, 26, 12, 0, 0, 0, time.UTC))
	if err := service.SaveRunHistory(entry); err != nil {
		t.Fatal(err)
	}

	entry.Records[0].Value[0] = 'X'
	entry.Records[0].Headers[0].Value[0] = 'X'
	entry.Scenario.WatchedTopics[0] = "changed"

	loaded, err := service.GetRunHistory("run-1", workspaceID)
	if err != nil {
		t.Fatal(err)
	}
	if string(loaded.Records[0].Value) != `{"orderId":"order-1"}` || string(loaded.Records[0].Headers[0].Value) != "corr-1" {
		t.Fatalf("stored record was mutated: %+v", loaded.Records[0])
	}
	if loaded.Scenario.WatchedTopics[0] != "payment.charged" {
		t.Fatalf("stored scenario was mutated: %+v", loaded.Scenario)
	}
	if len(loaded.Records) != 2 || loaded.Records[1].Sequence != 4 || loaded.TrackedTopics[1].Status != "unwitnessed" {
		t.Fatalf("loaded history = %+v", loaded)
	}
}

func TestRunHistoryIsOrderedAndWorkspaceScoped(t *testing.T) {
	service := testService(t)
	firstID := service.Snapshot().ActiveWorkspaceID
	first := testHistoryEntry(firstID, "first", time.Date(2026, 8, 26, 12, 0, 0, 0, time.UTC))
	if err := service.SaveRunHistory(first); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Create("Second"); err != nil {
		t.Fatal(err)
	}
	secondID := service.Snapshot().ActiveWorkspaceID
	if err := service.SaveRunHistory(testHistoryEntry(secondID, "second", first.FinishedAt.Add(time.Minute))); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SetActive(firstID); err != nil {
		t.Fatal(err)
	}
	items, err := service.ListRunHistory(firstID)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].RunID != "first" {
		t.Fatalf("first workspace history = %+v", items)
	}
	if _, err := service.ListRunHistory(secondID); !errors.Is(err, ErrRunHistoryStaleWorkspace) {
		t.Fatalf("stale list error = %v", err)
	}
	if _, err := service.GetRunHistory("first", secondID); !errors.Is(err, ErrRunHistoryStaleWorkspace) {
		t.Fatalf("stale detail error = %v", err)
	}
	if err := service.DeleteRunHistory("first", secondID); !errors.Is(err, ErrRunHistoryStaleWorkspace) {
		t.Fatalf("stale delete error = %v", err)
	}
	if _, err := service.GetRunHistory("second", firstID); !errors.Is(err, ErrRunHistoryNotFound) {
		t.Fatalf("cross-workspace detail error = %v", err)
	}
	if err := service.DeleteRunHistory("second", firstID); !errors.Is(err, ErrRunHistoryNotFound) {
		t.Fatalf("cross-workspace delete error = %v", err)
	}
	if err := service.SaveRunHistory(testHistoryEntry(secondID, "stale", first.FinishedAt.Add(2*time.Minute))); !errors.Is(err, ErrRunHistoryStaleWorkspace) {
		t.Fatalf("stale save error = %v", err)
	}
}

func TestRunHistorySaveRollsBackOnRecordConstraintFailure(t *testing.T) {
	service := testService(t)
	workspaceID := service.Snapshot().ActiveWorkspaceID
	entry := testHistoryEntry(workspaceID, "broken", time.Now().UTC())
	entry.Records[1].Sequence = entry.Records[0].Sequence
	if err := service.SaveRunHistory(entry); err == nil {
		t.Fatal("SaveRunHistory() returned nil for duplicate record sequence")
	}
	items, err := service.ListRunHistory(workspaceID)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("history after rollback = %+v", items)
	}
}

func TestRunHistoryOnlyPersistsTerminalStatuses(t *testing.T) {
	service := testService(t)
	workspaceID := service.Snapshot().ActiveWorkspaceID
	for _, status := range []string{"completed", "failed", "cancelled", "timed_out"} {
		entry := testHistoryEntry(workspaceID, "run-"+status, time.Now().UTC())
		entry.Status = status
		if err := service.SaveRunHistory(entry); err != nil {
			t.Fatalf("SaveRunHistory(%q) error = %v", status, err)
		}
	}
	nonTerminal := testHistoryEntry(workspaceID, "run-in-progress", time.Now().UTC())
	nonTerminal.Status = "in_progress"
	if err := service.SaveRunHistory(nonTerminal); !errors.Is(err, runhistory.ErrInvalidRun) {
		t.Fatalf("SaveRunHistory(in_progress) error = %v", err)
	}
}

func TestRunHistoryDeleteAndClearOnlyAffectActiveWorkspace(t *testing.T) {
	service := testService(t)
	firstID := service.Snapshot().ActiveWorkspaceID
	if err := service.SaveRunHistory(testHistoryEntry(firstID, "first", time.Now().UTC())); err != nil {
		t.Fatal(err)
	}
	state, err := service.Create("Second")
	if err != nil {
		t.Fatal(err)
	}
	secondID := state.ActiveWorkspaceID
	if err := service.SaveRunHistory(testHistoryEntry(secondID, "second", time.Now().UTC())); err != nil {
		t.Fatal(err)
	}
	if err := service.ClearRunHistory(firstID); !errors.Is(err, ErrRunHistoryStaleWorkspace) {
		t.Fatalf("stale clear error = %v", err)
	}
	if _, err := service.GetRunHistory("second", secondID); err != nil {
		t.Fatalf("stale clear removed active workspace history: %v", err)
	}
	if err := service.ClearRunHistory(secondID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.GetRunHistory("second", secondID); !errors.Is(err, ErrRunHistoryNotFound) {
		t.Fatalf("cleared history lookup = %v", err)
	}
	if _, err := service.SetActive(firstID); err != nil {
		t.Fatal(err)
	}
	items, err := service.ListRunHistory(firstID)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].RunID != "first" {
		t.Fatalf("other workspace history = %+v", items)
	}
}

func TestRunHistorySurvivesWorkspaceStatePersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "orson.db")
	service := NewService(Options{DatabasePath: path})
	state, err := service.Create("Durable")
	if err != nil {
		t.Fatal(err)
	}
	entry := testHistoryEntry(state.ActiveWorkspaceID, "durable", time.Now().UTC())
	if err := service.SaveRunHistory(entry); err != nil {
		t.Fatal(err)
	}
	if err := service.SaveConnection(ConnectionConfig{WorkspaceID: state.ActiveWorkspaceID, Name: "changed", Brokers: []string{"localhost:9092"}, ClientID: "test", DialTimeoutSeconds: 5, UpdatedAt: time.Now().UTC()}); err != nil {
		t.Fatal(err)
	}
	if err := service.Close(); err != nil {
		t.Fatal(err)
	}
	reopened := NewService(Options{DatabasePath: path})
	defer reopened.Close()
	loaded, err := reopened.GetRunHistory("durable", state.ActiveWorkspaceID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.RunID != "durable" || loaded.ConnectionName != "local Kafka" {
		t.Fatalf("reopened history = %+v", loaded)
	}
}
