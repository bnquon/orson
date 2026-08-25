package main

import (
	"strings"
	"testing"
	"testing/fstest"

	"orson/internal/scenario"
)

func TestListBundledScenarios(t *testing.T) {
	response := (&App{}).ListBundledScenarios()
	if !response.OK || response.Data == nil {
		t.Fatalf("ListBundledScenarios() failed: %+v", response.Error)
	}

	if len(response.Data.Scenarios) != 3 {
		t.Fatalf("scenario count = %d, want 3", len(response.Data.Scenarios))
	}
	for _, descriptor := range response.Data.Scenarios {
		if descriptor.Status != "valid" {
			t.Fatalf("descriptor %q status = %q, want valid", descriptor.ID, descriptor.Status)
		}
	}
}

func TestLoadBundledScenarioByID(t *testing.T) {
	response := (&App{}).LoadBundledScenario("order-flow.yaml")
	if !response.OK || response.Data == nil {
		t.Fatalf("LoadBundledScenario() failed: %+v", response.Error)
	}

	data := response.Data
	if data.ID != "order-flow.yaml" || data.SourceFilename != "order-flow.yaml" {
		t.Fatalf("scenario source = %q / %q, want order-flow.yaml", data.ID, data.SourceFilename)
	}
	if data.Name != "order-flow" || data.PublishTopic != "order.created" {
		t.Fatalf("scenario identity = %q / %q, want order-flow / order.created", data.Name, data.PublishTopic)
	}
	if data.CaptureTimeoutSec != 10 {
		t.Fatalf("CaptureTimeoutSec = %d, want 10", data.CaptureTimeoutSec)
	}
	if data.CorrelationHeader != "x-correlation-id" {
		t.Fatalf("CorrelationHeader = %q, want x-correlation-id", data.CorrelationHeader)
	}
	if len(data.Warnings) != 0 {
		t.Fatalf("Warnings = %+v, want none", data.Warnings)
	}
	if !strings.Contains(data.PublishPayload, `"items"`) {
		t.Fatalf("PublishPayload = %s, want nested items payload", data.PublishPayload)
	}
}

func TestScenarioAPIMapsPerFileDiagnostics(t *testing.T) {
	app := &App{
		scenarioCatalog: scenario.NewCatalog(fstest.MapFS{
			"warning.yml": {Data: []byte(`name: warning

publish:
  topic: root
  payload: {}

watch:
  - orphan

correlation:
  header: x-correlation-id

capture:
  timeout: 5s
`)},
			"broken.yaml": {Data: []byte("name: [")},
		}),
	}

	list := app.ListBundledScenarios()
	if !list.OK || list.Data == nil {
		t.Fatalf("ListBundledScenarios() failed: %+v", list.Error)
	}
	if list.Data.Scenarios[0].SourceFilename != "broken.yaml" {
		t.Fatalf("diagnostic filename = %q, want broken.yaml", list.Data.Scenarios[0].SourceFilename)
	}
	if list.Data.Scenarios[0].Status != apiScenarioStatusInvalid {
		t.Fatalf("broken status = %q, want invalid", list.Data.Scenarios[0].Status)
	}
	if list.Data.Scenarios[1].Status != apiScenarioStatusWithWarnings {
		t.Fatalf("warning status = %q, want valid_with_warnings", list.Data.Scenarios[1].Status)
	}

	invalid := app.LoadBundledScenario("broken.yaml")
	if invalid.OK || invalid.Error == nil || invalid.Error.Code != "scenario_parse_failed" {
		t.Fatalf("invalid load = %+v, want scenario_parse_failed", invalid)
	}
	if !strings.Contains(invalid.Error.Details, "broken.yaml") {
		t.Fatalf("invalid details = %q, want broken.yaml", invalid.Error.Details)
	}
}

func TestLoadBundledScenarioRejectsUnknownID(t *testing.T) {
	response := (&App{}).LoadBundledScenario("../order-flow.yaml")
	if response.OK || response.Error == nil || response.Error.Code != "invalid_scenario_id" {
		t.Fatalf("unknown unsafe load = %+v, want invalid_scenario_id", response)
	}
}

const (
	apiScenarioStatusInvalid      = "invalid"
	apiScenarioStatusWithWarnings = "valid_with_warnings"
)
