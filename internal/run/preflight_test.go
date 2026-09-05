package run

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"orson/internal/kafka"
)

func TestPreflightDiagnostics(t *testing.T) {
	for _, test := range []struct {
		name      string
		missing   []string
		lookupErr error
		wantRetry bool
	}{
		{name: "all topics exist"},
		{name: "missing root", missing: []string{"root"}},
		{name: "missing watched", missing: []string{"watch"}},
		{name: "multiple missing", missing: []string{"root", "watch"}},
		{name: "metadata failure", lookupErr: context.DeadlineExceeded, wantRetry: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			client := newEventKafkaClient()
			client.lookupTopics = func(ctx context.Context, names []string) ([]kafka.TopicMetadata, error) {
				if _, ok := ctx.Deadline(); !ok {
					t.Fatal("preflight has no deadline")
				}
				if !reflect.DeepEqual(names, []string{"root", "watch"}) {
					t.Fatalf("lookup names = %v", names)
				}
				var result []kafka.TopicMetadata
				for _, name := range names {
					topic := kafka.TopicMetadata{Name: name}
					for _, missing := range test.missing {
						if name == missing {
							topic.Missing = true
						}
					}
					result = append(result, topic)
				}
				return result, test.lookupErr
			}
			coordinator, _ := NewCoordinator(client)
			execute, err := coordinator.Prepare(context.Background(), RunRequest{RunID: "test", RootMessage: kafka.Message{Topic: " root "}, WatchedTopics: []string{" watch ", "root", "watch"}, CaptureTimeout: time.Millisecond})
			if len(test.missing) == 0 && test.lookupErr == nil {
				if err != nil || execute == nil {
					t.Fatalf("Prepare has execution = %t, error = %v", execute != nil, err)
				}
				return
			}
			var failure *PreflightError
			if !errors.As(err, &failure) || execute != nil {
				t.Fatalf("Prepare = %v", err)
			}
			if failure.Retryable() != test.wantRetry {
				t.Fatalf("retryable = %v", failure.Retryable())
			}
			var missing []string
			for _, diagnostic := range failure.Diagnostics {
				if diagnostic.Kind == TopicDiagnosticMissingTopic {
					missing = append(missing, diagnostic.Topic)
				}
				if diagnostic.Topic == "root" && !reflect.DeepEqual(diagnostic.Roles, []string{"root", "watched"}) {
					t.Fatalf("root roles = %v", diagnostic.Roles)
				}
			}
			if !reflect.DeepEqual(missing, test.missing) {
				t.Fatalf("missing = %v, want %v", missing, test.missing)
			}
		})
	}
}

func TestDirectRunPreflightFailureEmitsNothing(t *testing.T) {
	client := newEventKafkaClient()
	client.lookupTopics = func(context.Context, []string) ([]kafka.TopicMetadata, error) {
		return nil, errors.New("permission denied")
	}
	coordinator, _ := NewCoordinator(client)
	err := coordinator.Run(context.Background(), RunRequest{RunID: "test", RootMessage: kafka.Message{Topic: "root"}, WatchedTopics: []string{"watch"}, CaptureTimeout: time.Second}, func(Event) { t.Fatal("preflight emitted run event") })
	if err == nil {
		t.Fatal("expected preflight failure")
	}
	select {
	case <-client.published:
		t.Fatal("published during preflight failure")
	default:
	}
	select {
	case <-client.ready:
		t.Fatal("capture started during preflight failure")
	default:
	}
}

func TestPreflightOmittedAndBrokerMetadataAreRetryable(t *testing.T) {
	for _, metadata := range [][]kafka.TopicMetadata{nil, {{Name: "root", Err: errors.New("broker unavailable")}, {Name: "watch", Missing: true}}} {
		client := newEventKafkaClient()
		client.lookupTopics = func(context.Context, []string) ([]kafka.TopicMetadata, error) { return metadata, nil }
		coordinator, _ := NewCoordinator(client)
		err := coordinator.preflight(context.Background(), RunRequest{RootMessage: kafka.Message{Topic: "root"}, WatchedTopics: []string{"watch"}})
		var failure *PreflightError
		if !errors.As(err, &failure) || !failure.Retryable() {
			t.Fatalf("error = %v", err)
		}
		if len(failure.Diagnostics) != 2 {
			t.Fatalf("diagnostics = %v", failure.Diagnostics)
		}
	}
}

func TestSuccessfulPreflightContinuesOnceAndLaterFailureIsCaptureFailure(t *testing.T) {
	for _, disappears := range []bool{false, true} {
		t.Run(map[bool]string{false: "publishes", true: "topic disappears"}[disappears], func(t *testing.T) {
			client := newEventKafkaClient()
			checks := 0
			client.lookupTopics = func(context.Context, []string) ([]kafka.TopicMetadata, error) {
				checks++
				return []kafka.TopicMetadata{{Name: "root"}, {Name: "watch"}}, nil
			}
			if disappears {
				client.offsetsErr = errors.New("topic disappeared")
			}
			coordinator, _ := NewCoordinator(client)
			events := runCoordinator(t, coordinator, RunRequest{RunID: "test", RootMessage: kafka.Message{Topic: " root "}, WatchedTopics: []string{"watch"}, CaptureTimeout: 10 * time.Millisecond})
			if checks != 1 {
				t.Fatalf("metadata checks = %d", checks)
			}
			if events[0].Kind != EventStarted {
				t.Fatal("run did not start")
			}
			if disappears {
				last := events[len(events)-1]
				if last.Status != RunStatusFailed || last.Failure.Stage != FailureStageCapture {
					t.Fatalf("terminal = %+v", last)
				}
			} else if client.message.Topic != "root" {
				t.Fatalf("published topic = %q", client.message.Topic)
			}
		})
	}
}
