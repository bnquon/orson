package scenario

import (
	"bytes"
	"strings"
	"testing"
	"time"
)

func TestMarshalCanonicalRoundTripsEditableFieldsAndOrder(t *testing.T) {
	draft := Draft{
		Name:           "ordered scenario",
		PublishTopic:   "root.created",
		PublishPayload: `{"z":1,"a":{"second":2,"first":1}}`,
		MessageKey:     "message-42",
		Headers: []Header{
			{Key: "x-zeta", Value: "last alphabetically"},
			{Key: "content-type", Value: "application/json"},
			{Key: "x-alpha", Value: "first alphabetically"},
		},
		WatchedTopics:     []string{"third.topic", "first.topic", "second.topic"},
		CorrelationHeader: "x-flow-id",
		CaptureTimeout:    12 * time.Second,
		Topology: []TopologyEdge{
			{From: "root.created", To: "third.topic"},
			{From: "third.topic", To: "first.topic"},
			{From: "first.topic", To: "second.topic"},
		},
	}

	normalized, err := NormalizeDraft("ordered.yaml", draft)
	if err != nil {
		t.Fatalf("NormalizeDraft() failed: %v", err)
	}
	source, err := MarshalCanonical(normalized)
	if err != nil {
		t.Fatalf("MarshalCanonical() failed: %v", err)
	}
	if !bytes.HasSuffix(source, []byte("\n")) {
		t.Fatalf("canonical YAML lacks trailing newline: %q", source)
	}

	headerPositions := []int{
		bytes.Index(source, []byte("x-zeta")),
		bytes.Index(source, []byte("content-type")),
		bytes.Index(source, []byte("x-alpha")),
	}
	if !(headerPositions[0] < headerPositions[1] && headerPositions[1] < headerPositions[2]) {
		t.Fatalf("header order changed in:\n%s", source)
	}
	watchPositions := []int{
		bytes.Index(source, []byte("third.topic")),
		bytes.Index(source, []byte("first.topic")),
		bytes.Index(source, []byte("second.topic")),
	}
	if !(watchPositions[0] < watchPositions[1] && watchPositions[1] < watchPositions[2]) {
		t.Fatalf("watch order changed in:\n%s", source)
	}

	roundTripped, err := Load("ordered.yaml", source)
	if err != nil {
		t.Fatalf("Load(canonical) failed: %v\n%s", err, source)
	}
	secondSource, err := MarshalCanonical(roundTripped)
	if err != nil {
		t.Fatalf("second MarshalCanonical() failed: %v", err)
	}
	if !bytes.Equal(source, secondSource) {
		t.Fatalf("canonical YAML changed after round trip:\nfirst:\n%s\nsecond:\n%s", source, secondSource)
	}
	if roundTripped.MessageKey != draft.MessageKey {
		t.Fatalf("MessageKey = %q, want %q", roundTripped.MessageKey, draft.MessageKey)
	}
	if len(roundTripped.Headers) != len(draft.Headers) || roundTripped.Headers[0] != draft.Headers[0] {
		t.Fatalf("Headers = %+v, want %+v", roundTripped.Headers, draft.Headers)
	}
	if got := strings.Join(roundTripped.WatchedTopics, ","); got != "third.topic,first.topic,second.topic" {
		t.Fatalf("WatchedTopics = %q, order changed", got)
	}
	for index, edge := range roundTripped.Topology {
		if edge.From != draft.Topology[index].From || edge.To != draft.Topology[index].To {
			t.Fatalf("Topology[%d] = %+v, want %+v", index, edge, draft.Topology[index])
		}
	}
}

func TestLoadPublishKeyAndHeaderCompatibilityDefaults(t *testing.T) {
	base := `name: compatibility
publish:
  topic: root
  payload: {}
watch: [child]
correlation:
  header: x-correlation-id
capture:
  timeout: 5s
topology:
  - from: root
    to: child
`
	loaded, err := Load("old.yaml", []byte(base))
	if err != nil {
		t.Fatalf("Load(old schema) failed: %v", err)
	}
	if loaded.MessageKey != "" {
		t.Fatalf("MessageKey = %q, want empty compatibility default", loaded.MessageKey)
	}
	if len(loaded.Headers) != 1 || loaded.Headers[0].Key != "content-type" {
		t.Fatalf("Headers = %+v, want content-type compatibility default", loaded.Headers)
	}

	explicitEmpty := strings.Replace(base, "  payload: {}", "  headers: []\n  payload: {}", 1)
	loaded, err = Load("empty-headers.yaml", []byte(explicitEmpty))
	if err != nil {
		t.Fatalf("Load(explicit empty headers) failed: %v", err)
	}
	if loaded.Headers == nil || len(loaded.Headers) != 0 {
		t.Fatalf("Headers = %#v, want explicit non-nil empty list", loaded.Headers)
	}
}

func TestMarshalCanonicalDoesNotIncludeRuntimeData(t *testing.T) {
	loaded, err := Load("valid.yaml", []byte(validCatalogYAML("safe")))
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}
	source, err := MarshalCanonical(loaded)
	if err != nil {
		t.Fatalf("MarshalCanonical() failed: %v", err)
	}
	for _, forbidden := range []string{"credentials", "brokers", "connection", "captured", "runHistory", "inspector"} {
		if bytes.Contains(source, []byte(forbidden)) {
			t.Fatalf("canonical YAML contains runtime field %q:\n%s", forbidden, source)
		}
	}
}

func TestLoadRejectsUnknownPublishAndHeaderFieldsWithPaths(t *testing.T) {
	tests := []struct {
		name   string
		source string
		path   string
	}{
		{name: "root", source: strings.Replace(validCatalogYAML("unknown"), "name: unknown", "name: unknown\nmystery: true", 1), path: "mystery"},
		{name: "publish", source: strings.Replace(validCatalogYAML("unknown"), "  topic: valid", "  topic: valid\n  mystery: true", 1), path: "publish.mystery"},
		{name: "header", source: strings.Replace(validCatalogYAML("unknown"), "  payload:", "  headers:\n    - key: x-test\n      value: ok\n      mystery: true\n  payload:", 1), path: "publish.headers[0].mystery"},
		{name: "correlation", source: strings.Replace(validCatalogYAML("unknown"), "  header: x-correlation-id", "  header: x-correlation-id\n  mystery: true", 1), path: "correlation.mystery"},
		{name: "capture", source: strings.Replace(validCatalogYAML("unknown"), "  timeout: 5s", "  timeout: 5s\n  mystery: true", 1), path: "capture.mystery"},
		{name: "topology", source: strings.Replace(validCatalogYAML("unknown"), "    to: watched", "    to: watched\n    mystery: true", 1), path: "topology[0].mystery"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := Load(test.name+".yaml", []byte(test.source))
			loadErr := assertLoadErrorStage(t, err, "yaml_parse")
			if loadErr.Issues[0].Code != "unknown_yaml_field" || loadErr.Issues[0].Path != test.path || loadErr.Issues[0].Line == 0 || loadErr.Issues[0].Column == 0 {
				t.Fatalf("issue = %+v, want unknown field at %q", loadErr.Issues[0], test.path)
			}
			if strings.Contains(loadErr.Issues[0].Details, "scenario.raw") {
				t.Fatalf("technical details expose implementation type: %q", loadErr.Issues[0].Details)
			}
		})
	}
}

func TestNormalizeDraftRejectsInvalidEditableFields(t *testing.T) {
	tests := []struct {
		name string
		edit func(*Draft)
		code string
	}{
		{name: "empty header", edit: func(draft *Draft) { draft.Headers[0].Key = " " }, code: "missing_publish_header_key"},
		{name: "managed header", edit: func(draft *Draft) { draft.Headers[0].Key = "X-FLOW-ID" }, code: "managed_correlation_header"},
		{name: "watched root", edit: func(draft *Draft) { draft.WatchedTopics[0] = "root" }, code: "watched_publish_topic"},
		{name: "large timeout", edit: func(draft *Draft) { draft.CaptureTimeout = 301 * time.Second }, code: "capture_timeout_too_large"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			draft := orderedLocalDraft()
			test.edit(&draft)
			_, err := NormalizeDraft("invalid.yaml", draft)
			loadErr := assertLoadErrorStage(t, err, "validation")
			for _, issue := range loadErr.Issues {
				if issue.Code == test.code {
					return
				}
			}
			t.Fatalf("issues = %+v, want %q", loadErr.Issues, test.code)
		})
	}
}
