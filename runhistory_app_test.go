package main

import (
	"context"
	"testing"
	"time"

	"orson/internal/api"
	"orson/internal/kafka"
)

func TestAppPersistsTerminalRunHistoryWithoutChangingLiveRunEvents(t *testing.T) {
	readStarted := make(chan struct{})
	active := &fakeKafkaConnection{
		readFromOffsets: func(ctx context.Context, _ []kafka.PartitionOffset, _ func(kafka.Record) error) error {
			close(readStarted)
			<-ctx.Done()
			return ctx.Err()
		},
	}
	app := newApp(&fakeKafkaConnector{connections: []KafkaConnection{active}})
	startConnectionTestApp(t, app)
	defer app.shutdown(context.Background())
	events := make(chan api.RunEvent, 8)
	app.emitEvent = func(_ context.Context, _ string, event api.RunEvent) {
		events <- event
	}

	if response := app.Connect(validConnectionRequest("Local Kafka")); !response.OK {
		t.Fatalf("Connect() failed: %+v", response.Error)
	}
	start := app.StartRun(api.RunRequest{
		RootTopic:             "order.created",
		Payload:               `{"orderId":"42"}`,
		WatchedTopics:         []string{"payment.charged"},
		CaptureTimeoutSeconds: 5,
		ScenarioSnapshot: &api.RunScenarioSnapshot{
			Version:           1,
			Source:            api.ScenarioSourceLocal,
			ScenarioID:        "checkout.yaml",
			SourcePath:        "/tmp/checkout.yaml",
			SourceFilename:    "checkout.yaml",
			DisplayName:       "Checkout flow",
			RootTopic:         "order.created",
			WatchedTopics:     []string{"payment.charged"},
			Payload:           `{"orderId":"42"}`,
			CaptureTimeoutSec: 5,
		},
	})
	if !start.OK || start.Data == nil {
		t.Fatalf("StartRun() failed: %+v", start.Error)
	}
	select {
	case <-readStarted:
	case <-time.After(time.Second):
		t.Fatal("run did not reach capture")
	}
	if response := app.StopRun(start.Data.RunID); !response.OK {
		t.Fatalf("StopRun() failed: %+v", response.Error)
	}

	var finished api.RunEvent
	deadline := time.After(time.Second)
	for finished.Kind != "finished" {
		select {
		case event := <-events:
			finished = event
		case <-deadline:
			t.Fatal("run did not emit a terminal event")
		}
	}
	if finished.Status != "cancelled" {
		t.Fatalf("finished status = %q, want cancelled", finished.Status)
	}

	workspaceID := app.workspaceService().Snapshot().ActiveWorkspaceID
	history := app.ListRunHistory(workspaceID)
	if !history.OK || history.Data == nil || len(history.Data.Runs) != 1 {
		t.Fatalf("ListRunHistory() = %+v", history)
	}
	item := history.Data.Runs[0]
	if item.RunID != start.Data.RunID || item.Status != "cancelled" || item.ScenarioSource != "local" {
		t.Fatalf("history summary = %+v", item)
	}
	detail := app.GetRunHistory(start.Data.RunID, workspaceID)
	if !detail.OK || detail.Data == nil || detail.Data.Scenario.Reference != "/tmp/checkout.yaml" {
		t.Fatalf("GetRunHistory() = %+v", detail)
	}
}

func TestAppHistoryPersistenceFailureDoesNotChangeTerminalRun(t *testing.T) {
	readStarted := make(chan struct{})
	active := &fakeKafkaConnection{
		readFromOffsets: func(ctx context.Context, _ []kafka.PartitionOffset, _ func(kafka.Record) error) error {
			close(readStarted)
			<-ctx.Done()
			return ctx.Err()
		},
	}
	app := newApp(&fakeKafkaConnector{connections: []KafkaConnection{active}})
	startConnectionTestApp(t, app)
	defer app.shutdown(context.Background())
	events := make(chan api.RunEvent, 8)
	historyErrors := make(chan *api.APIError, 1)
	app.emitEvent = func(_ context.Context, _ string, event api.RunEvent) {
		events <- event
	}
	app.emitHistoryEvent = func(_ context.Context, _ string, event *api.APIError) {
		historyErrors <- event
	}

	if response := app.Connect(validConnectionRequest("Local Kafka")); !response.OK {
		t.Fatalf("Connect() failed: %+v", response.Error)
	}
	start := app.StartRun(api.RunRequest{
		RootTopic:             "order.created",
		Payload:               `{"orderId":"42"}`,
		WatchedTopics:         []string{"payment.charged"},
		CaptureTimeoutSeconds: 5,
	})
	if !start.OK || start.Data == nil {
		t.Fatalf("StartRun() failed: %+v", start.Error)
	}
	select {
	case <-readStarted:
	case <-time.After(time.Second):
		t.Fatal("run did not reach capture")
	}
	if err := app.workspaceService().Close(); err != nil {
		t.Fatal(err)
	}
	if response := app.StopRun(start.Data.RunID); !response.OK {
		t.Fatalf("StopRun() failed: %+v", response.Error)
	}

	var finished api.RunEvent
	deadline := time.After(time.Second)
	for finished.Kind != "finished" {
		select {
		case event := <-events:
			finished = event
		case <-deadline:
			t.Fatal("run did not emit a terminal event")
		}
	}
	if finished.Status != "cancelled" {
		t.Fatalf("finished status = %q, want cancelled", finished.Status)
	}
	select {
	case historyError := <-historyErrors:
		if historyError.Code != "run_history_persistence_failed" {
			t.Fatalf("history error = %+v", historyError)
		}
	case <-time.After(time.Second):
		t.Fatal("run history persistence failure was not surfaced")
	}
}
