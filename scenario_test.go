package main

import (
	"strings"
	"testing"
)

func TestLoadBundledScenario(t *testing.T) {
	response := (&App{}).LoadBundledScenario()
	if !response.OK || response.Data == nil {
		t.Fatalf("LoadBundledScenario() failed: %+v", response.Error)
	}

	data := response.Data
	if data.SourceFilename != bundledScenarioFilename {
		t.Fatalf("SourceFilename = %q, want %q", data.SourceFilename, bundledScenarioFilename)
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
