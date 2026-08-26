package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"orson/internal/api"
	"orson/internal/scenario"
)

func TestImportLocalScenarioUsesDialogAndReturnsBackendIdentity(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "payment-debug.yaml")
	writeLocalAPITestFile(t, path, localAPITestYAML("payment debug"))
	dialogs := &fakeScenarioDialogs{openPaths: []string{path, path}}
	app := &App{scenarioDialogs: dialogs, localScenarios: scenario.NewLocalRegistry(nil)}

	first := app.ImportLocalScenario()
	second := app.ImportLocalScenario()
	if !first.OK || first.Data == nil || first.Data.Descriptor == nil || first.Data.Scenario == nil {
		t.Fatalf("first import = %+v, want success", first)
	}
	if !second.OK || second.Data == nil || second.Data.Descriptor == nil {
		t.Fatalf("second import = %+v, want success", second)
	}
	if first.Data.Descriptor.ID != second.Data.Descriptor.ID {
		t.Fatalf("duplicate import IDs = %q / %q, want backend identity reused", first.Data.Descriptor.ID, second.Data.Descriptor.ID)
	}
	if first.Data.Descriptor.Source != api.ScenarioSourceLocal || first.Data.Descriptor.SourceFilename != "payment-debug.yaml" {
		t.Fatalf("descriptor source = %+v", first.Data.Descriptor)
	}
	if first.Data.Scenario.MessageKey != "order-key" || len(first.Data.Scenario.Headers) != 2 {
		t.Fatalf("scenario publish fields = %+v", first.Data.Scenario)
	}
	listed := app.ListLocalScenarios()
	if !listed.OK || listed.Data == nil || len(listed.Data.Scenarios) != 1 {
		t.Fatalf("ListLocalScenarios() = %+v, want one deduplicated entry", listed)
	}
}

func TestRemoveLocalScenarioRemovesOnlyTheWorkspaceAssociation(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "remove-me.yaml")
	source := localAPITestYAML("remove me")
	writeLocalAPITestFile(t, path, source)
	app := &App{
		localScenarios:  scenario.NewLocalRegistry(nil),
		scenarioDialogs: &fakeScenarioDialogs{openPaths: []string{path}},
	}
	imported := app.ImportLocalScenario()
	if !imported.OK || imported.Data == nil || imported.Data.Descriptor == nil {
		t.Fatalf("ImportLocalScenario() = %+v", imported)
	}
	removed := app.RemoveLocalScenario(imported.Data.Descriptor.ID)
	if !removed.OK || removed.Data == nil {
		t.Fatalf("RemoveLocalScenario() = %+v", removed)
	}
	if listed := app.ListLocalScenarios(); listed.Data == nil || len(listed.Data.Scenarios) != 0 {
		t.Fatalf("listed scenarios after removal = %+v", listed)
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != source {
		t.Fatalf("RemoveLocalScenario() modified YAML: %q", contents)
	}
}

func TestImportLocalScenarioCancellationAndFailuresPreserveRegistry(t *testing.T) {
	directory := t.TempDir()
	invalidPath := filepath.Join(directory, "invalid.yaml")
	writeLocalAPITestFile(t, invalidPath, "name: [")
	app := &App{
		scenarioDialogs: &fakeScenarioDialogs{openPaths: []string{"", invalidPath}},
		localScenarios:  scenario.NewLocalRegistry(nil),
	}

	cancelled := app.ImportLocalScenario()
	if !cancelled.OK || cancelled.Data == nil || !cancelled.Data.Cancelled || cancelled.Error != nil {
		t.Fatalf("cancelled import = %+v, want successful no-op", cancelled)
	}
	invalid := app.ImportLocalScenario()
	if invalid.OK || invalid.Error == nil || invalid.Error.Code != "scenario_parse_failed" || invalid.Data == nil || len(invalid.Data.Diagnostics) == 0 {
		t.Fatalf("invalid import = %+v, want structured parse diagnostics", invalid)
	}
	if got := app.ListLocalScenarios(); got.Data == nil || len(got.Data.Scenarios) != 0 {
		t.Fatalf("invalid import registered a local source: %+v", got)
	}
}

func TestImportLocalScenarioReportsNativeDialogFailure(t *testing.T) {
	app := &App{scenarioDialogs: &fakeScenarioDialogs{openErr: errors.New("native unavailable")}}
	response := app.ImportLocalScenario()
	if response.OK || response.Error == nil || response.Error.Code != "scenario_open_dialog_failed" {
		t.Fatalf("dialog failure = %+v", response)
	}
}

func TestSaveScenarioAsThenSaveLocalScenario(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(directory, "branched.yaml")
	dialogs := &fakeScenarioDialogs{savePaths: []string{target}}
	app := &App{scenarioDialogs: dialogs, localScenarios: scenario.NewLocalRegistry(nil)}
	draft := localAPITestDraft()

	savedAs := app.SaveScenarioAs(draft)
	if !savedAs.OK || savedAs.Data == nil || savedAs.Data.Descriptor == nil || savedAs.Data.Scenario == nil {
		t.Fatalf("SaveScenarioAs() = %+v", savedAs)
	}
	if dialogs.defaultFilenames[0] != "payment-debug.yaml" {
		t.Fatalf("default filename = %q, want payment-debug.yaml", dialogs.defaultFilenames[0])
	}
	if savedAs.Data.Scenario.SourceFilename != "branched.yaml" || savedAs.Data.Scenario.Source != api.ScenarioSourceLocal {
		t.Fatalf("active saved source = %+v", savedAs.Data.Scenario)
	}

	draft.PublishPayload = `{"status":"edited"}`
	saved := app.SaveLocalScenario(savedAs.Data.Descriptor.ID, draft)
	if !saved.OK || saved.Data == nil || saved.Data.Scenario == nil {
		t.Fatalf("SaveLocalScenario() = %+v", saved)
	}
	source, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("ReadFile(saved) failed: %v", err)
	}
	if !strings.Contains(string(source), "status: edited") {
		t.Fatalf("saved YAML did not change payload:\n%s", source)
	}
}

func TestSaveScenarioAsReplacesExistingSelectedFile(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(directory, "existing.yaml")
	writeLocalAPITestFile(t, target, localAPITestYAML("existing scenario"))
	dialogs := &fakeScenarioDialogs{savePaths: []string{target}}
	app := &App{scenarioDialogs: dialogs, localScenarios: scenario.NewLocalRegistry(nil)}
	draft := localAPITestDraft()
	draft.Name = "replacement scenario"

	response := app.SaveScenarioAs(draft)
	if !response.OK || response.Data == nil || response.Data.Descriptor == nil || response.Data.Scenario == nil {
		t.Fatalf("SaveScenarioAs(existing) = %+v, want success", response)
	}
	if response.Data.Descriptor.SourceFilename != "existing.yaml" || response.Data.Scenario.ID != response.Data.Descriptor.ID {
		t.Fatalf("active existing target = %+v / %+v", response.Data.Descriptor, response.Data.Scenario)
	}
	source, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("ReadFile(existing target) failed: %v", err)
	}
	loaded, err := scenario.Load(filepath.Base(target), source)
	if err != nil {
		t.Fatalf("Load(replaced target) failed: %v", err)
	}
	if loaded.Name != draft.Name || loaded.MessageKey != draft.MessageKey {
		t.Fatalf("replaced target = %+v, want submitted draft", loaded)
	}
	if listed := app.ListLocalScenarios(); listed.Data == nil || len(listed.Data.Scenarios) != 1 || listed.Data.Scenarios[0].ID != response.Data.Descriptor.ID {
		t.Fatalf("registered existing target = %+v", listed)
	}
}

func TestSaveScenarioAsCancelAndInvalidDraftDoNotWriteOrOpenPicker(t *testing.T) {
	dialogs := &fakeScenarioDialogs{savePaths: []string{""}}
	app := &App{scenarioDialogs: dialogs, localScenarios: scenario.NewLocalRegistry(nil)}
	cancelled := app.SaveScenarioAs(localAPITestDraft())
	if !cancelled.OK || cancelled.Data == nil || !cancelled.Data.Cancelled {
		t.Fatalf("cancelled Save as = %+v", cancelled)
	}

	invalid := localAPITestDraft()
	invalid.PublishPayload = "not JSON"
	response := app.SaveScenarioAs(invalid)
	if response.OK || response.Error == nil || response.Error.Code != "scenario_validation_failed" {
		t.Fatalf("invalid Save as = %+v", response)
	}
	if len(dialogs.defaultFilenames) != 1 {
		t.Fatalf("invalid Save as opened native picker %d times, want no additional call", len(dialogs.defaultFilenames))
	}
}

func TestBoundedCaptureTimeoutSafelyRepresentsOversizedAPIValues(t *testing.T) {
	if got := boundedCaptureTimeout(10); got != 10*time.Second {
		t.Fatalf("boundedCaptureTimeout(10) = %s, want 10s", got)
	}
	if got := boundedCaptureTimeout(int(^uint(0) >> 1)); got != (maxCaptureTimeoutSeconds+1)*time.Second {
		t.Fatalf("boundedCaptureTimeout(max int) = %s, want bounded invalid duration", got)
	}
}

func TestSaveScenarioAsReportsNativeDialogFailure(t *testing.T) {
	app := &App{
		scenarioDialogs: &fakeScenarioDialogs{saveErr: errors.New("save panel unavailable")},
		localScenarios:  scenario.NewLocalRegistry(nil),
	}
	response := app.SaveScenarioAs(localAPITestDraft())
	if response.OK || response.Error == nil || response.Error.Code != "scenario_save_dialog_failed" {
		t.Fatalf("save dialog failure = %+v", response)
	}
}

func TestScenarioFileOperationsAreRejectedDuringActiveRun(t *testing.T) {
	dialogs := &fakeScenarioDialogs{openPaths: []string{"unused.yaml"}, savePaths: []string{"unused.yaml"}}
	app := &App{
		activeRuns:      1,
		scenarioDialogs: dialogs,
		localScenarios:  scenario.NewLocalRegistry(nil),
	}
	for name, response := range map[string]api.ScenarioFileResponse{
		"import":  app.ImportLocalScenario(),
		"save":    app.SaveLocalScenario("local:anything", localAPITestDraft()),
		"save as": app.SaveScenarioAs(localAPITestDraft()),
	} {
		if response.OK || response.Error == nil || response.Error.Code != "run_busy" {
			t.Fatalf("%s during run = %+v, want run_busy", name, response)
		}
	}
	if len(dialogs.defaultFilenames) != 0 || dialogs.openCalls != 0 {
		t.Fatalf("active-run operation opened native dialog: %+v", dialogs)
	}
	if response := app.LoadLocalScenario("local:anything"); response.OK || response.Error == nil || response.Error.Code != "run_busy" {
		t.Fatalf("LoadLocalScenario during run = %+v", response)
	}
}

func TestBundledScenarioIDCannotBeSavedInPlace(t *testing.T) {
	app := &App{localScenarios: scenario.NewLocalRegistry(nil)}
	response := app.SaveLocalScenario("order-flow.yaml", localAPITestDraft())
	if response.OK || response.Error == nil || response.Error.Code != "local_scenario_not_found" {
		t.Fatalf("SaveLocalScenario(bundled) = %+v, want read-only/not-local rejection", response)
	}
}

type fakeScenarioDialogs struct {
	openPaths        []string
	savePaths        []string
	openErr          error
	saveErr          error
	openCalls        int
	defaultFilenames []string
}

func (d *fakeScenarioDialogs) OpenScenarioFile(context.Context) (string, error) {
	d.openCalls++
	if d.openErr != nil {
		return "", d.openErr
	}
	if len(d.openPaths) == 0 {
		return "", nil
	}
	value := d.openPaths[0]
	d.openPaths = d.openPaths[1:]
	return value, nil
}

func (d *fakeScenarioDialogs) SaveScenarioFile(_ context.Context, defaultFilename string) (string, error) {
	d.defaultFilenames = append(d.defaultFilenames, defaultFilename)
	if d.saveErr != nil {
		return "", d.saveErr
	}
	if len(d.savePaths) == 0 {
		return "", nil
	}
	value := d.savePaths[0]
	d.savePaths = d.savePaths[1:]
	return value, nil
}

func localAPITestDraft() api.ScenarioDraft {
	return api.ScenarioDraft{
		Name:           "payment debug",
		PublishTopic:   "order.created",
		PublishPayload: `{"status":"pending"}`,
		MessageKey:     "order-key",
		Headers: []api.Header{
			{Key: "content-type", Value: "application/json"},
			{Key: "x-debug", Value: "true"},
		},
		WatchedTopics:         []string{"payment.charged", "notification.sent"},
		CorrelationHeader:     "x-correlation-id",
		CaptureTimeoutSeconds: 10,
		Topology: []api.ScenarioTopologyEdge{
			{From: "order.created", To: "payment.charged"},
			{From: "payment.charged", To: "notification.sent"},
		},
	}
}

func localAPITestYAML(name string) string {
	return `name: ` + name + `
publish:
  topic: order.created
  key: order-key
  headers:
    - key: content-type
      value: application/json
    - key: x-debug
      value: "true"
  payload:
    status: pending
watch:
  - payment.charged
  - notification.sent
correlation:
  header: x-correlation-id
capture:
  timeout: 10s
topology:
  - from: order.created
    to: payment.charged
  - from: payment.charged
    to: notification.sent
`
}

func writeLocalAPITestFile(t *testing.T, path, source string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(source), 0o600); err != nil {
		t.Fatalf("WriteFile(%q) failed: %v", path, err)
	}
}
