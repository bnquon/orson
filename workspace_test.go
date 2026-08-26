package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"orson/internal/api"
)

func writeWorkspaceScenario(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "workspace.yaml")
	content := `name: Workspace scenario
publish:
  topic: orders
  payload: {}
watch:
  - payments
correlation:
  header: x-correlation-id
capture:
  timeout: 5s
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestWorkspaceBootstrapCreatesDefaultAndIncludesGlobalExamples(t *testing.T) {
	app := newApp(&fakeKafkaConnector{})
	app.startup(context.Background())
	defer app.shutdown(context.Background())

	response := app.BootstrapWorkspace()
	if !response.OK || response.Data == nil {
		t.Fatalf("BootstrapWorkspace() = %+v", response)
	}
	if len(response.Data.Workspaces) != 1 || response.Data.ActiveWorkspace.Name != "My workspace" {
		t.Fatalf("workspaces = %+v", response.Data.Workspaces)
	}
	if len(response.Data.BundledScenarios) == 0 || len(response.Data.LocalScenarios) != 0 {
		t.Fatalf("scenario bootstrap = bundled %d, local %d", len(response.Data.BundledScenarios), len(response.Data.LocalScenarios))
	}
	if response.Data.Connection.Active != nil || response.Data.Persistence.Mode != "persistent" {
		t.Fatalf("startup state = %+v", response.Data)
	}
}

func TestWorkspaceSwitchIsolatesLocalScenariosAndRestoresSelection(t *testing.T) {
	path := writeWorkspaceScenario(t)
	app := newApp(&fakeKafkaConnector{})
	app.startup(context.Background())
	defer app.shutdown(context.Background())
	app.scenarioDialogs = &fakeScenarioDialogs{openPaths: []string{path}}

	first := app.BootstrapWorkspace().Data
	imported := app.ImportLocalScenario()
	if !imported.OK || imported.Data == nil || imported.Data.Descriptor == nil {
		t.Fatalf("ImportLocalScenario() = %+v, error = %+v", imported, imported.Error)
	}
	if result := app.SetWorkspaceSelectedScenario(api.WorkspaceSelectionRequest{WorkspaceID: first.ActiveWorkspace.ID, Source: "local", ScenarioID: imported.Data.Descriptor.ID}); !result.OK {
		t.Fatalf("SetWorkspaceSelectedScenario() = %+v", result)
	}

	created := app.CreateWorkspace("Second")
	if !created.OK || created.Data.ActiveWorkspace.Name != "Second" || len(created.Data.LocalScenarios) != 0 {
		t.Fatalf("CreateWorkspace() = %+v", created)
	}
	if len(created.Data.BundledScenarios) == 0 {
		t.Fatal("bundled examples disappeared from second workspace")
	}
	restored := app.SetActiveWorkspace(first.ActiveWorkspace.ID)
	if !restored.OK || len(restored.Data.LocalScenarios) != 1 || restored.Data.SelectedScenario == nil {
		t.Fatalf("restored bootstrap = %+v", restored)
	}
	if restored.Data.SelectedScenario.Source != api.ScenarioSourceLocal {
		t.Fatalf("restored source = %q", restored.Data.SelectedScenario.Source)
	}
}

func TestSuccessfulConnectionIsRememberedAndSwitchDisconnects(t *testing.T) {
	connection := &fakeKafkaConnection{}
	app := newApp(&fakeKafkaConnector{connections: []KafkaConnection{connection}})
	app.startup(context.Background())
	defer app.shutdown(context.Background())

	request := validConnectionRequest("Local Kafka")
	if response := app.Connect(request); !response.OK {
		t.Fatalf("Connect() = %+v", response)
	}
	bootstrap := app.BootstrapWorkspace()
	if bootstrap.Data.RememberedConnection == nil || bootstrap.Data.RememberedConnection.Name != request.Name {
		t.Fatalf("remembered connection = %+v", bootstrap.Data.RememberedConnection)
	}
	created := app.CreateWorkspace("Second")
	if !created.OK || created.Data.Connection.Active != nil || created.Data.RememberedConnection != nil {
		t.Fatalf("created workspace connection = %+v", created.Data)
	}
	if !connection.isClosed() {
		t.Fatal("previous workspace connection was not closed")
	}
}

func TestFailedConnectionDoesNotOverwriteRememberedSettings(t *testing.T) {
	connector := &fakeKafkaConnector{
		connections: []KafkaConnection{&fakeKafkaConnection{}},
		errors:      []error{nil, errors.New("broker unavailable")},
	}
	app := newApp(connector)
	app.startup(context.Background())
	defer app.shutdown(context.Background())
	if response := app.Connect(validConnectionRequest("Remember me")); !response.OK {
		t.Fatalf("first Connect() = %+v", response)
	}
	if response := app.Connect(validConnectionRequest("Do not save")); response.OK {
		t.Fatalf("failed Connect() unexpectedly succeeded")
	}
	remembered := app.BootstrapWorkspace().Data.RememberedConnection
	if remembered == nil || remembered.Name != "Remember me" {
		t.Fatalf("remembered connection = %+v", remembered)
	}
}

func TestDeletingWorkspaceNeverDeletesImportedYAML(t *testing.T) {
	path := writeWorkspaceScenario(t)
	app := newApp(&fakeKafkaConnector{})
	app.startup(context.Background())
	defer app.shutdown(context.Background())
	app.scenarioDialogs = &fakeScenarioDialogs{openPaths: []string{path}}
	firstID := app.BootstrapWorkspace().Data.ActiveWorkspace.ID
	if response := app.ImportLocalScenario(); !response.OK {
		t.Fatalf("ImportLocalScenario() = %+v, error = %+v", response, response.Error)
	}
	if response := app.CreateWorkspace("Second"); !response.OK {
		t.Fatalf("CreateWorkspace() = %+v", response)
	}
	if response := app.DeleteWorkspace(firstID); !response.OK {
		t.Fatalf("DeleteWorkspace() = %+v", response)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("imported YAML was removed or modified: %v", err)
	}
}

func TestWorkspaceChangesAreBlockedDuringActiveRun(t *testing.T) {
	app := newApp(&fakeKafkaConnector{})
	app.startup(context.Background())
	defer app.shutdown(context.Background())
	app.stateMu.Lock()
	app.activeRuns = 1
	app.stateMu.Unlock()
	defer func() {
		app.stateMu.Lock()
		app.activeRuns = 0
		app.stateMu.Unlock()
	}()

	if response := app.CreateWorkspace("Blocked"); response.OK || response.Error == nil || response.Error.Code != runBusyCode {
		t.Fatalf("CreateWorkspace() during run = %+v", response)
	}
}

func TestShutdownWaitsForScenarioOperationsBeforeClosingWorkspaceService(t *testing.T) {
	app := newApp(&fakeKafkaConnector{})
	app.startup(context.Background())

	app.scenarioOpMu.Lock()
	shutdownDone := make(chan struct{})
	go func() {
		app.shutdown(context.Background())
		close(shutdownDone)
	}()
	select {
	case <-shutdownDone:
		t.Fatal("shutdown completed while a scenario operation was active")
	case <-time.After(25 * time.Millisecond):
	}
	app.scenarioOpMu.Unlock()

	select {
	case <-shutdownDone:
	case <-time.After(time.Second):
		t.Fatal("shutdown did not complete after the scenario operation released")
	}
}

func TestWorkspaceReadsAndRenamesShareTransitionSerialization(t *testing.T) {
	app := newApp(&fakeKafkaConnector{})
	app.startup(context.Background())
	defer app.shutdown(context.Background())

	app.lifecycleMu.Lock()
	started := make(chan struct{})
	bootstrapDone := make(chan api.WorkspaceBootstrapResponse, 1)
	go func() {
		close(started)
		bootstrapDone <- app.BootstrapWorkspace()
	}()
	<-started
	assertWorkspaceOperationBlocked(t, bootstrapDone)
	app.lifecycleMu.Unlock()
	if response := <-bootstrapDone; !response.OK {
		t.Fatalf("BootstrapWorkspace() = %+v", response)
	}

	activeID := app.BootstrapWorkspace().Data.ActiveWorkspace.ID
	app.lifecycleMu.Lock()
	renameDone := make(chan api.WorkspaceBootstrapResponse, 1)
	go func() {
		renameDone <- app.RenameWorkspace(activeID, "Renamed")
	}()
	assertWorkspaceOperationBlocked(t, renameDone)
	app.lifecycleMu.Unlock()
	if response := <-renameDone; !response.OK {
		t.Fatalf("RenameWorkspace() = %+v", response)
	}
}

func TestListLocalScenariosSharesScenarioOperationSerialization(t *testing.T) {
	app := newApp(&fakeKafkaConnector{})
	app.startup(context.Background())
	defer app.shutdown(context.Background())

	app.scenarioOpMu.Lock()
	started := make(chan struct{})
	done := make(chan api.ScenarioListResponse, 1)
	go func() {
		close(started)
		done <- app.ListLocalScenarios()
	}()
	<-started
	assertWorkspaceOperationBlocked(t, done)
	app.scenarioOpMu.Unlock()
	if response := <-done; !response.OK {
		t.Fatalf("ListLocalScenarios() = %+v", response)
	}
}

func assertWorkspaceOperationBlocked[T any](t *testing.T, done <-chan T) {
	t.Helper()
	select {
	case result := <-done:
		t.Fatalf("operation completed while its serialization lock was held: %+v", result)
	case <-time.After(25 * time.Millisecond):
	}
}
