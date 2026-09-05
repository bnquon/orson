package api

import (
	"strings"
	"testing"
)

func TestRunRequestValidateRejectsMalformedTopicsAndPayload(t *testing.T) {
	tests := []struct {
		name    string
		request RunRequest
	}{
		{
			name: "blank watched topic",
			request: RunRequest{
				RootTopic:             "order.created",
				Payload:               "{}",
				WatchedTopics:         []string{" "},
				CaptureTimeoutSeconds: 5,
			},
		},
		{
			name: "invalid JSON payload",
			request: RunRequest{
				RootTopic:             "order.created",
				Payload:               "not-json",
				WatchedTopics:         []string{"payment.charged"},
				CaptureTimeoutSeconds: 5,
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := test.request.Validate(); err == nil {
				t.Fatal("Validate() returned nil, want an error")
			}
		})
	}
}

func TestRunRequestNormalizeCanonicalizesTopics(t *testing.T) {
	request := RunRequest{
		RootTopic:     " root ",
		WatchedTopics: []string{" watch-b ", "watch-a", "watch-b", " root ", "root"},
		ScenarioSnapshot: &RunScenarioSnapshot{
			RootTopic:     " snapshot-root ",
			WatchedTopics: []string{" snapshot-b ", "snapshot-a", "snapshot-b"},
		},
	}

	normalized := request.Normalize()
	if normalized.RootTopic != "root" {
		t.Fatalf("root topic = %q, want root", normalized.RootTopic)
	}
	want := []string{"watch-b", "watch-a", "root"}
	if len(normalized.WatchedTopics) != len(want) {
		t.Fatalf("watched topics = %v, want %v", normalized.WatchedTopics, want)
	}
	for index := range want {
		if normalized.WatchedTopics[index] != want[index] {
			t.Fatalf("watched topics = %v, want %v", normalized.WatchedTopics, want)
		}
	}
	snapshotWant := []string{"snapshot-b", "snapshot-a"}
	if normalized.ScenarioSnapshot == request.ScenarioSnapshot || normalized.ScenarioSnapshot.RootTopic != "snapshot-root" {
		t.Fatalf("normalized snapshot = %+v", normalized.ScenarioSnapshot)
	}
	if len(normalized.ScenarioSnapshot.WatchedTopics) != len(snapshotWant) {
		t.Fatalf("snapshot watched topics = %v, want %v", normalized.ScenarioSnapshot.WatchedTopics, snapshotWant)
	}
	for index := range snapshotWant {
		if normalized.ScenarioSnapshot.WatchedTopics[index] != snapshotWant[index] {
			t.Fatalf("snapshot watched topics = %v, want %v", normalized.ScenarioSnapshot.WatchedTopics, snapshotWant)
		}
	}
	if request.RootTopic != " root " || request.WatchedTopics[0] != " watch-b " || request.ScenarioSnapshot.RootTopic != " snapshot-root " || request.ScenarioSnapshot.WatchedTopics[0] != " snapshot-b " {
		t.Fatalf("Normalize mutated original request: %+v", request)
	}
}

func TestRunRequestValidateAcceptsValidJSONAndDistinctTopics(t *testing.T) {
	request := RunRequest{
		RootTopic:             "order.created",
		Payload:               `{ "orderId": "ord_123" }`,
		WatchedTopics:         []string{"payment.charged", "inventory.reserved"},
		CaptureTimeoutSeconds: 5,
	}

	if err := request.Validate(); err != nil {
		t.Fatalf("Validate() failed: %v", err)
	}
}

func TestRunRequestValidateRejectsTimeoutOverflow(t *testing.T) {
	request := RunRequest{
		RootTopic:             "order.created",
		Payload:               "{}",
		WatchedTopics:         []string{"payment.charged"},
		CaptureTimeoutSeconds: int(maxCaptureTimeoutSeconds + 1),
	}

	if err := request.Validate(); err == nil {
		t.Fatal("Validate() returned nil, want timeout overflow error")
	}
}

func TestRunRequestResolvesCorrelationHeader(t *testing.T) {
	if got := (RunRequest{}).ResolvedCorrelationHeader(); got != "x-correlation-id" {
		t.Fatalf("default correlation header = %q, want x-correlation-id", got)
	}
	if got := (RunRequest{CorrelationHeader: "  X-Flow-ID  "}).ResolvedCorrelationHeader(); got != "X-Flow-ID" {
		t.Fatalf("custom correlation header = %q, want X-Flow-ID", got)
	}
}

func TestRunRequestValidateRejectsManagedCustomHeader(t *testing.T) {
	tests := []struct {
		name              string
		correlationHeader string
		customHeader      string
	}{
		{name: "default for older caller", customHeader: " X-Correlation-ID "},
		{name: "configured", correlationHeader: "X-Flow-ID", customHeader: " x-FLOW-id "},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := RunRequest{
				RootTopic:             "order.created",
				Payload:               "{}",
				Headers:               []Header{{Key: test.customHeader, Value: "user-value"}},
				CorrelationHeader:     test.correlationHeader,
				WatchedTopics:         []string{"payment.charged"},
				CaptureTimeoutSeconds: 5,
			}

			err := request.Validate()
			if err == nil || !strings.Contains(err.Error(), "managed automatically") {
				t.Fatalf("Validate() error = %v, want managed header conflict", err)
			}
		})
	}
}
