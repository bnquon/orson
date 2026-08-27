package api

import (
	"testing"
	"time"

	"orson/internal/runhistory"
)

func TestRunHistoryDataFromDomainPreservesDetailAndMetadata(t *testing.T) {
	entry := runhistory.Entry{
		Summary: runhistory.Summary{
			RunID: "run-1", Scenario: runhistory.ScenarioSnapshot{Version: 1, ID: "local:orders", Source: "local", Reference: "/tmp/orders.yaml", DisplayName: "Orders", RootTopic: "orders.created", CaptureTimeout: 1500 * time.Millisecond},
			RootTopic: "orders.created", Status: "timed_out", StartedAt: time.Unix(10, 0), FinishedAt: time.Unix(11, 0), Duration: time.Second, EventCount: 1, FailureStage: "timeout", FailureMessage: "capture timeout",
		},
		Records:       []runhistory.Record{{Sequence: 2, Kind: "message", Topic: "orders.created", Key: []byte("key"), Value: []byte(`{"id":1}`), Headers: []runhistory.Header{{Key: "x", Value: []byte("y")}}, Offset: 99, Timestamp: time.Unix(10, 500000000)}},
		TrackedTopics: []runhistory.TopicStatus{{Topic: "payments", Status: "unwitnessed"}},
	}
	data := RunHistoryDataFromDomain(entry)
	if data.Summary.RunID != "run-1" || data.Summary.DurationMs != 1000 || data.Summary.FailureStage != "timeout" {
		t.Fatalf("summary = %+v", data.Summary)
	}
	if data.Scenario.CaptureTimeoutSec != 1 || data.Scenario.Reference != "/tmp/orders.yaml" {
		t.Fatalf("scenario = %+v", data.Scenario)
	}
	if len(data.Records) != 1 || data.Records[0].Offset != "99" || data.Records[0].Headers[0].Value != "y" {
		t.Fatalf("records = %+v", data.Records)
	}
	if data.TrackedTopics[0].Status != "unwitnessed" {
		t.Fatalf("tracked topics = %+v", data.TrackedTopics)
	}
}

func TestRunHistoryResponseHelpers(t *testing.T) {
	list := RunHistoryListSuccess(RunHistoryListData{Runs: []RunHistorySummary{{RunID: "run-1"}}})
	if !list.OK || list.Data == nil || list.Error != nil {
		t.Fatalf("list success = %+v", list)
	}
	if RunHistoryListFailure(NewError("failed", "no", "", false)).OK {
		t.Fatal("list failure marked successful")
	}
	if !RunHistoryActionSuccess().OK || RunHistoryActionFailure(nil).OK {
		t.Fatal("action helper status is incorrect")
	}
}
