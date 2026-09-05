package main

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"orson/internal/api"
	"orson/internal/kafka"
)

func TestStartRunNormalizesTopicsBeforeValidationAndPreflight(t *testing.T) {
	active := &fakeKafkaConnection{
		lookupTopics: func(_ context.Context, names []string) ([]kafka.TopicMetadata, error) {
			want := []string{"root", "watch-b", "watch-a"}
			if !reflect.DeepEqual(names, want) {
				t.Fatalf("lookup topics = %v, want %v", names, want)
			}
			return []kafka.TopicMetadata{
				{Name: "root", Missing: true},
				{Name: "watch-b"},
				{Name: "watch-a"},
			}, nil
		},
	}
	app := newApp(&fakeKafkaConnector{connections: []KafkaConnection{active}})
	startConnectionTestApp(t, app)
	defer app.shutdown(context.Background())
	if response := app.Connect(validConnectionRequest("Local")); !response.OK {
		t.Fatal(response.Error)
	}

	response := app.StartRun(api.RunRequest{
		RootTopic:             " root ",
		Payload:               "{}",
		WatchedTopics:         []string{" watch-b ", "watch-a", "watch-b", " root ", "root"},
		CaptureTimeoutSeconds: 1,
	})
	if response.OK || response.Error == nil {
		t.Fatalf("StartRun() = %+v, want preflight failure", response)
	}
	if response.Error.Code != api.ErrorCodePreflightMissingTopics {
		t.Fatalf("error code = %q, want %q", response.Error.Code, api.ErrorCodePreflightMissingTopics)
	}
	if len(response.Error.TopicDiagnostics) != 1 {
		t.Fatalf("diagnostics = %+v, want one", response.Error.TopicDiagnostics)
	}
	diagnostic := response.Error.TopicDiagnostics[0]
	if diagnostic.Kind != api.TopicDiagnosticMissingTopic || diagnostic.Topic != "root" || !reflect.DeepEqual(diagnostic.Roles, []string{"root", "watched"}) {
		t.Fatalf("diagnostic = %+v", diagnostic)
	}
}

func TestStartRunPreflightFailureLeavesNoRunOrHistoryAndCanRetry(t *testing.T) {
	for _, metadataFailure := range []bool{false, true} {
		t.Run(map[bool]string{false: "missing topics", true: "metadata unavailable"}[metadataFailure], func(t *testing.T) {
			calls := 0
			active := &fakeKafkaConnection{
				lookupTopics: func(context.Context, []string) ([]kafka.TopicMetadata, error) {
					calls++
					if metadataFailure {
						return nil, errors.New("connection failed")
					}
					return []kafka.TopicMetadata{{Name: "root", Missing: true}, {Name: "watch", Missing: true}}, nil
				},
				readFromOffsets: func(context.Context, []kafka.PartitionOffset, func(kafka.Record) error) error {
					t.Error("capture started")
					return nil
				},
			}
			app := newApp(&fakeKafkaConnector{connections: []KafkaConnection{active}})
			startConnectionTestApp(t, app)
			defer app.shutdown(context.Background())
			app.emitEvent = func(context.Context, string, api.RunEvent) { t.Error("run event emitted") }
			if response := app.Connect(validConnectionRequest("Local")); !response.OK {
				t.Fatal(response.Error)
			}
			request := api.RunRequest{RootTopic: " root ", Payload: "{}", WatchedTopics: []string{" watch "}, CaptureTimeoutSeconds: 1}
			for attempt := 0; attempt < 2; attempt++ {
				response := app.StartRun(request)
				if response.OK || response.Data != nil || response.Error == nil {
					t.Fatalf("response = %+v", response)
				}
				wantCode := api.ErrorCodePreflightMissingTopics
				if metadataFailure {
					wantCode = api.ErrorCodePreflightMetadataUnavailable
				}
				if response.Error.Code != wantCode || response.Error.Retryable != metadataFailure {
					t.Fatalf("error = %+v", response.Error)
				}
				if !metadataFailure && len(response.Error.TopicDiagnostics) != 2 {
					t.Fatalf("diagnostics = %+v", response.Error.TopicDiagnostics)
				}
			}
			if calls != 2 || app.activeRun != nil || app.activeRuns != 0 {
				t.Fatal("preflight did not release run reservation for retry")
			}
			if _, ok := active.publishedMessage(); ok {
				t.Fatal("root published")
			}
			if app.GetConnectionStatus().Data.Active == nil {
				t.Fatal("connection cleared")
			}
			history := app.ListRunHistory(app.workspaceService().Snapshot().ActiveWorkspaceID)
			if !history.OK || len(history.Data.Runs) != 0 {
				t.Fatalf("history = %+v", history)
			}
		})
	}
}
