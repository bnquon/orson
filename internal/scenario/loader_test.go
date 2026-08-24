package scenario

import (
	"embed"
	"strings"
	"testing"
	"time"
)

//go:embed testdata/*.yaml testdata/*.yaml.invalid
var testFixtures embed.FS

func loadFixture(t *testing.T, name string) (Scenario, error) {
	t.Helper()
	source, err := testFixtures.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("read fixture %q: %v", name, err)
	}
	return Load("testdata/"+name, source)
}

func TestLoadValidScenario(t *testing.T) {
	loaded, err := loadFixture(t, "valid-nested.yaml")
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}

	if loaded.Name != "order-flow-fixture" {
		t.Fatalf("Name = %q, want order-flow-fixture", loaded.Name)
	}
	if loaded.PublishTopic != "order.created" {
		t.Fatalf("PublishTopic = %q, want order.created", loaded.PublishTopic)
	}
	if loaded.CorrelationHeader != "x-correlation-id" {
		t.Fatalf("CorrelationHeader = %q, want x-correlation-id", loaded.CorrelationHeader)
	}
	if loaded.CaptureTimeout != 10*time.Second {
		t.Fatalf("CaptureTimeout = %s, want 10s", loaded.CaptureTimeout)
	}
	if !strings.Contains(loaded.PublishPayload, `"orderId": "ord_fixture"`) ||
		!strings.Contains(loaded.PublishPayload, `"items": [`) {
		t.Fatalf("PublishPayload = %s, want nested JSON payload", loaded.PublishPayload)
	}
	if loaded.Topology[0].ID != "edge:order.created->payment.charged" {
		t.Fatalf("Topology[0].ID = %q, want stable source/target ID", loaded.Topology[0].ID)
	}
}

func TestCaptureTimeoutSeconds(t *testing.T) {
	seconds, err := CaptureTimeoutSeconds(10 * time.Second)
	if err != nil {
		t.Fatalf("CaptureTimeoutSeconds() failed: %v", err)
	}
	if seconds != 10 {
		t.Fatalf("seconds = %d, want 10", seconds)
	}

	if _, err := CaptureTimeoutSeconds(1500 * time.Millisecond); err == nil {
		t.Fatal("CaptureTimeoutSeconds() accepted fractional seconds")
	}
}

func TestLoadRejectsMalformedYAML(t *testing.T) {
	_, err := loadFixture(t, "malformed.yaml.invalid")
	assertLoadErrorStage(t, err, "yaml_parse")
}

func TestLoadRejectsUnknownYAMLFields(t *testing.T) {
	_, err := loadFixture(t, "unknown-field.yaml")
	assertLoadErrorStage(t, err, "yaml_parse")
}

func TestLoadRejectsMissingRequiredFields(t *testing.T) {
	tests := []struct {
		fixture string
		code    string
	}{
		{fixture: "missing-name.yaml", code: "missing_name"},
		{fixture: "missing-publish-topic.yaml", code: "missing_publish_topic"},
		{fixture: "missing-watch.yaml", code: "missing_watch"},
		{fixture: "missing-correlation-header.yaml", code: "missing_correlation_header"},
		{fixture: "missing-capture-timeout.yaml", code: "missing_capture_timeout"},
	}

	for _, test := range tests {
		t.Run(test.fixture, func(t *testing.T) {
			_, err := loadFixture(t, test.fixture)
			loadErr := assertLoadErrorStage(t, err, "validation")
			for _, issue := range loadErr.Issues {
				if issue.Code == test.code {
					return
				}
			}
			t.Fatalf("missing issue code %q in %+v", test.code, loadErr.Issues)
		})
	}
}

func TestLoadRejectsEmptyAndDuplicateWatchedTopics(t *testing.T) {
	_, err := loadFixture(t, "empty-duplicate-watch.yaml")
	loadErr := assertLoadErrorStage(t, err, "validation")

	var duplicate, empty bool
	for _, issue := range loadErr.Issues {
		duplicate = duplicate || issue.Code == "duplicate_watch_topic"
		empty = empty || issue.Code == "empty_watch_topic"
		if issue.Code == "duplicate_watch_topic" && (issue.Line == 0 || issue.Column == 0) {
			t.Errorf("duplicate issue location = %d:%d, want YAML source location", issue.Line, issue.Column)
		}
		if issue.Code == "empty_watch_topic" && (issue.Line == 0 || issue.Column == 0) {
			t.Errorf("empty issue location = %d:%d, want YAML source location", issue.Line, issue.Column)
		}
	}
	if !duplicate || !empty {
		t.Fatalf("issues = %+v, want duplicate and empty topic errors", loadErr.Issues)
	}
}

func TestLoadReportsParserSourceLocation(t *testing.T) {
	_, err := loadFixture(t, "malformed.yaml")
	loadErr := assertLoadErrorStage(t, err, "yaml_parse")
	if loadErr.Issues[0].Line == 0 {
		t.Fatalf("parser issue location = %d:%d, want YAML source line", loadErr.Issues[0].Line, loadErr.Issues[0].Column)
	}
}

func TestLoadRejectsInvalidPayloadConversion(t *testing.T) {
	_, err := loadFixture(t, "invalid-payload.yaml")
	loadErr := assertLoadErrorStage(t, err, "validation")
	if len(loadErr.Issues) != 1 || loadErr.Issues[0].Code != "invalid_publish_payload" {
		t.Fatalf("issues = %+v, want invalid_publish_payload", loadErr.Issues)
	}
}

func TestLoadKeepsValidEdgesAndWarnsForInvalidTopology(t *testing.T) {
	loaded, err := loadFixture(t, "topology-warnings.yaml")
	if err != nil {
		t.Fatalf("Load() failed: %v", err)
	}
	if len(loaded.Topology) != 2 {
		t.Fatalf("valid topology edges = %d, want 2", len(loaded.Topology))
	}
	if len(loaded.Warnings) != 4 {
		t.Fatalf("warnings = %d, want 4", len(loaded.Warnings))
	}
}

func TestLoadRejectsTopologyCycle(t *testing.T) {
	_, err := loadFixture(t, "topology-cycle.yaml")
	loadErr := assertLoadErrorStage(t, err, "validation")
	if len(loadErr.Issues) != 1 || loadErr.Issues[0].Code != "topology_cycle" {
		t.Fatalf("issues = %+v, want topology_cycle", loadErr.Issues)
	}
}

func assertLoadErrorStage(t *testing.T, err error, stage string) *LoadError {
	t.Helper()
	if err == nil {
		t.Fatal("Load() returned nil error")
	}
	loadErr, ok := err.(*LoadError)
	if !ok {
		t.Fatalf("error type = %T, want *LoadError", err)
	}
	if loadErr.Stage != stage {
		t.Fatalf("error stage = %q, want %q", loadErr.Stage, stage)
	}
	return loadErr
}
