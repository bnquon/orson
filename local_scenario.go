package main

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"orson/internal/api"
	"orson/internal/scenario"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type scenarioFileDialogs interface {
	OpenScenarioFile(context.Context) (string, error)
	SaveScenarioFile(context.Context, string) (string, error)
}

type wailsScenarioFileDialogs struct{}

func (wailsScenarioFileDialogs) OpenScenarioFile(ctx context.Context) (string, error) {
	return runtime.OpenFileDialog(ctx, runtime.OpenDialogOptions{
		Title: "Import scenario YAML",
		Filters: []runtime.FileFilter{{
			DisplayName: "YAML scenario files (*.yaml, *.yml)",
			Pattern:     "*.yaml;*.yml",
		}},
		ResolvesAliases: true,
	})
}

func (wailsScenarioFileDialogs) SaveScenarioFile(ctx context.Context, defaultFilename string) (string, error) {
	return runtime.SaveFileDialog(ctx, runtime.SaveDialogOptions{
		Title:           "Save scenario YAML",
		DefaultFilename: defaultFilename,
		Filters: []runtime.FileFilter{{
			DisplayName: "YAML scenario files (*.yaml, *.yml)",
			Pattern:     "*.yaml;*.yml",
		}},
		CanCreateDirectories: true,
	})
}

// ListLocalScenarios returns imported files registered for this process only.
func (a *App) ListLocalScenarios() api.ScenarioListResponse {
	a.scenarioOpMu.Lock()
	defer a.scenarioOpMu.Unlock()

	descriptors := a.getLocalScenarioRegistry().List()
	items := make([]api.ScenarioDescriptor, 0, len(descriptors))
	for _, descriptor := range descriptors {
		items = append(items, toAPIScenarioDescriptor(descriptor))
	}
	return api.ScenarioListSuccess(api.ScenarioListData{Scenarios: items})
}

// ImportLocalScenario asks the native desktop shell for a YAML file, then
// validates it without replacing any frontend draft on failure.
func (a *App) ImportLocalScenario() api.ScenarioFileResponse {
	a.scenarioOpMu.Lock()
	defer a.scenarioOpMu.Unlock()

	if apiErr := a.scenarioFileRunGuard(); apiErr != nil {
		return api.ScenarioFileFailure(apiErr, nil)
	}
	selectedPath, err := a.getScenarioFileDialogs().OpenScenarioFile(a.appContext())
	if err != nil {
		return api.ScenarioFileFailure(api.NewError(
			"scenario_open_dialog_failed",
			"The scenario picker could not be opened.",
			err.Error(),
			true,
		), nil)
	}
	if strings.TrimSpace(selectedPath) == "" {
		return api.ScenarioFileSuccess(api.ScenarioFileData{Cancelled: true})
	}
	if apiErr := a.scenarioFileRunGuard(); apiErr != nil {
		return api.ScenarioFileFailure(apiErr, nil)
	}

	descriptor, loaded, err := a.getLocalScenarioRegistry().Import(selectedPath)
	if err != nil {
		return localScenarioFailure(err)
	}
	if err := a.persistLocalScenarioDescriptor(descriptor); err != nil {
		return api.ScenarioFileFailure(workspaceAPIError(err), nil)
	}
	apiDescriptor := toAPIScenarioDescriptor(descriptor)
	apiScenario := toAPILocalScenarioData(descriptor, loaded)
	return api.ScenarioFileSuccess(api.ScenarioFileData{
		Descriptor:  &apiDescriptor,
		Scenario:    &apiScenario,
		Persistence: a.currentWorkspacePersistence(),
	})
}

// LoadLocalScenario refreshes one session-owned imported file. A file changed
// outside Orson must be imported again, so the caller never silently replaces
// an active draft with unreviewed disk content.
func (a *App) LoadLocalScenario(id string) api.ScenarioResponse {
	a.scenarioOpMu.Lock()
	defer a.scenarioOpMu.Unlock()

	if apiErr := a.scenarioFileRunGuard(); apiErr != nil {
		return api.ScenarioFailure(apiErr)
	}
	descriptor, loaded, err := a.getLocalScenarioRegistry().Load(id)
	if err != nil {
		response := localScenarioFailure(err)
		return api.ScenarioFailure(response.Error)
	}
	return api.ScenarioSuccess(toAPILocalScenarioData(descriptor, loaded))
}

// RemoveLocalScenario removes the current workspace's association with an
// imported YAML file. The file on disk is never deleted or modified.
func (a *App) RemoveLocalScenario(id string) api.ScenarioFileResponse {
	a.scenarioOpMu.Lock()
	defer a.scenarioOpMu.Unlock()

	if apiErr := a.scenarioFileRunGuard(); apiErr != nil {
		return api.ScenarioFileFailure(apiErr, nil)
	}
	registry := a.getLocalScenarioRegistry()
	reference, err := registry.Reference(id)
	if err != nil {
		return localScenarioFailure(err)
	}
	service := a.workspaceService()
	state := service.Snapshot()
	if err := service.RemoveScenario(state.ActiveWorkspaceID, reference.CanonicalPath); err != nil {
		return api.ScenarioFileFailure(workspaceAPIError(err), nil)
	}
	if err := registry.Remove(id); err != nil {
		return localScenarioFailure(err)
	}
	return api.ScenarioFileSuccess(api.ScenarioFileData{Persistence: a.currentWorkspacePersistence()})
}

// SaveLocalScenario writes a valid draft back to the imported file represented
// by the backend-owned opaque session ID.
func (a *App) SaveLocalScenario(id string, draft api.ScenarioDraft) api.ScenarioFileResponse {
	a.scenarioOpMu.Lock()
	defer a.scenarioOpMu.Unlock()

	if apiErr := a.scenarioFileRunGuard(); apiErr != nil {
		return api.ScenarioFileFailure(apiErr, nil)
	}
	descriptor, loaded, err := a.getLocalScenarioRegistry().Save(id, toScenarioDraft(draft))
	if err != nil {
		return localScenarioFailure(err)
	}
	if err := a.persistLocalScenarioDescriptor(descriptor); err != nil {
		return api.ScenarioFileFailure(workspaceAPIError(err), nil)
	}
	apiDescriptor := toAPIScenarioDescriptor(descriptor)
	apiScenario := toAPILocalScenarioData(descriptor, loaded)
	return api.ScenarioFileSuccess(api.ScenarioFileData{
		Descriptor:  &apiDescriptor,
		Scenario:    &apiScenario,
		Persistence: a.currentWorkspacePersistence(),
	})
}

// SaveScenarioAs validates before opening the native picker. Source identity is
// updated only after the selected path is written successfully.
func (a *App) SaveScenarioAs(draft api.ScenarioDraft) api.ScenarioFileResponse {
	a.scenarioOpMu.Lock()
	defer a.scenarioOpMu.Unlock()

	if apiErr := a.scenarioFileRunGuard(); apiErr != nil {
		return api.ScenarioFileFailure(apiErr, nil)
	}
	normalizedDraft := toScenarioDraft(draft)
	defaultFilename := defaultScenarioFilename(draft.Name)
	if _, err := scenario.NormalizeDraft(defaultFilename, normalizedDraft); err != nil {
		return localScenarioFailure(localDraftValidationError(defaultFilename, err))
	}

	selectedPath, err := a.getScenarioFileDialogs().SaveScenarioFile(a.appContext(), defaultFilename)
	if err != nil {
		return api.ScenarioFileFailure(api.NewError(
			"scenario_save_dialog_failed",
			"The scenario save picker could not be opened.",
			err.Error(),
			true,
		), nil)
	}
	if strings.TrimSpace(selectedPath) == "" {
		return api.ScenarioFileSuccess(api.ScenarioFileData{Cancelled: true})
	}
	if apiErr := a.scenarioFileRunGuard(); apiErr != nil {
		return api.ScenarioFileFailure(apiErr, nil)
	}

	descriptor, loaded, err := a.getLocalScenarioRegistry().SaveAs(selectedPath, normalizedDraft)
	if err != nil {
		return localScenarioFailure(err)
	}
	if err := a.persistLocalScenarioDescriptor(descriptor); err != nil {
		return api.ScenarioFileFailure(workspaceAPIError(err), nil)
	}
	apiDescriptor := toAPIScenarioDescriptor(descriptor)
	apiScenario := toAPILocalScenarioData(descriptor, loaded)
	return api.ScenarioFileSuccess(api.ScenarioFileData{
		Descriptor:  &apiDescriptor,
		Scenario:    &apiScenario,
		Persistence: a.currentWorkspacePersistence(),
	})
}

func (a *App) persistLocalScenarioDescriptor(descriptor scenario.Descriptor) error {
	service := a.workspaceService()
	state := service.Snapshot()
	reference, err := workspaceScenarioReference(state.ActiveWorkspaceID, descriptor, a.getLocalScenarioRegistry(), time.Now().UTC())
	if err != nil {
		return err
	}
	return service.UpsertScenario(reference)
}

func (a *App) currentWorkspacePersistence() *api.WorkspacePersistenceStatus {
	persistence := toAPIPersistence(a.workspaceService().Snapshot().Persistence)
	return &persistence
}

func (a *App) getLocalScenarioRegistry() *scenario.LocalRegistry {
	a.stateMu.Lock()
	defer a.stateMu.Unlock()
	if a.localScenarios == nil {
		a.localScenarios = scenario.NewLocalRegistry(nil)
	}
	return a.localScenarios
}

func (a *App) getScenarioFileDialogs() scenarioFileDialogs {
	a.stateMu.Lock()
	defer a.stateMu.Unlock()
	if a.scenarioDialogs == nil {
		a.scenarioDialogs = wailsScenarioFileDialogs{}
	}
	return a.scenarioDialogs
}

func (a *App) appContext() context.Context {
	a.stateMu.Lock()
	defer a.stateMu.Unlock()
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}

func (a *App) scenarioFileRunGuard() *api.APIError {
	a.stateMu.Lock()
	defer a.stateMu.Unlock()
	if a.activeRuns > 0 {
		return api.NewError(
			"run_busy",
			"Scenario files cannot change during an active run.",
			"Wait for the current run to finish before importing, switching, or saving a scenario.",
			true,
		)
	}
	if a.shuttingDown {
		return api.NewError(
			"app_shutting_down",
			"Orson is shutting down.",
			"Reopen Orson before changing scenario files.",
			false,
		)
	}
	return nil
}

func toScenarioDraft(draft api.ScenarioDraft) scenario.Draft {
	headers := make([]scenario.Header, 0, len(draft.Headers))
	for _, header := range draft.Headers {
		headers = append(headers, scenario.Header{Key: header.Key, Value: header.Value})
	}
	edges := make([]scenario.TopologyEdge, 0, len(draft.Topology))
	for _, edge := range draft.Topology {
		edges = append(edges, scenario.TopologyEdge{ID: edge.ID, From: edge.From, To: edge.To})
	}
	timeout := boundedCaptureTimeout(draft.CaptureTimeoutSeconds)
	return scenario.Draft{
		Name:              draft.Name,
		PublishTopic:      draft.PublishTopic,
		PublishPayload:    draft.PublishPayload,
		MessageKey:        draft.MessageKey,
		Headers:           headers,
		WatchedTopics:     append([]string(nil), draft.WatchedTopics...),
		CorrelationHeader: draft.CorrelationHeader,
		CaptureTimeout:    timeout,
		Topology:          edges,
	}
}

const maxCaptureTimeoutSeconds = 300

// boundedCaptureTimeout avoids overflowing time.Duration for untrusted API
// integers while retaining an out-of-range value for scenario validation.
func boundedCaptureTimeout(seconds int) time.Duration {
	if seconds <= 0 {
		return 0
	}
	if seconds > maxCaptureTimeoutSeconds {
		return time.Duration(maxCaptureTimeoutSeconds+1) * time.Second
	}
	return time.Duration(seconds) * time.Second
}

func localScenarioFailure(err error) api.ScenarioFileResponse {
	var fileErr *scenario.FileError
	if !errors.As(err, &fileErr) {
		return api.ScenarioFileFailure(api.NewError(
			"scenario_file_failed",
			"The scenario file operation failed.",
			err.Error(),
			false,
		), nil)
	}

	diagnostics := toAPIDiagnostics(fileErr.Diagnostics)
	if len(fileErr.Diagnostics) > 0 {
		issues := make([]apiScenarioIssue, 0, len(fileErr.Diagnostics))
		for _, diagnostic := range fileErr.Diagnostics {
			issues = append(issues, apiScenarioIssue{
				Code:           diagnostic.Code,
				Path:           diagnostic.Path,
				Message:        diagnostic.Message,
				Details:        diagnostic.Details,
				SourceFilename: diagnostic.SourceFilename,
				Line:           diagnostic.Line,
				Column:         diagnostic.Column,
			})
		}
		return api.ScenarioFileFailure(scenarioIssuesAPIError(fileErr.Code, sentenceCase(fileErr.Message)+".", issues), diagnostics)
	}

	details := ""
	if fileErr.Err != nil {
		details = fileErr.Err.Error()
	}
	return api.ScenarioFileFailure(api.NewError(
		fileErr.Code,
		sentenceCase(fileErr.Message)+".",
		details,
		fileErr.Code == "scenario_read_failed" || fileErr.Code == "scenario_write_failed",
	), nil)
}

func localDraftValidationError(filename string, err error) *scenario.FileError {
	var loadErr *scenario.LoadError
	code := "scenario_validation_failed"
	message := "the scenario configuration is invalid"
	if errors.As(err, &loadErr) && loadErr.Stage == "yaml_parse" {
		code = "scenario_parse_failed"
		message = "the scenario YAML could not be parsed"
	}
	diagnostics := make([]scenario.Diagnostic, 0)
	if errors.As(err, &loadErr) {
		for _, issue := range loadErr.Issues {
			diagnostics = append(diagnostics, scenario.Diagnostic{
				Code: issue.Code, Path: issue.Path, Message: issue.Message, Details: issue.Details,
				SourceFilename: filename, Line: issue.Line, Column: issue.Column,
			})
		}
	}
	return &scenario.FileError{Code: code, Message: message, Diagnostics: diagnostics, Err: err}
}

func toAPIDiagnostics(source []scenario.Diagnostic) []api.ScenarioDiagnostic {
	result := make([]api.ScenarioDiagnostic, 0, len(source))
	for _, diagnostic := range source {
		result = append(result, api.ScenarioDiagnostic{
			Code: diagnostic.Code, Path: diagnostic.Path, Message: diagnostic.Message,
			Details: diagnostic.Details, SourceFilename: diagnostic.SourceFilename,
			Line: diagnostic.Line, Column: diagnostic.Column,
		})
	}
	return result
}

func defaultScenarioFilename(name string) string {
	name = strings.TrimSpace(name)
	var builder strings.Builder
	lastSeparator := false
	for _, value := range name {
		if unicode.IsLetter(value) || unicode.IsDigit(value) || value == '-' || value == '_' {
			builder.WriteRune(value)
			lastSeparator = false
			continue
		}
		if !lastSeparator {
			builder.WriteByte('-')
			lastSeparator = true
		}
	}
	base := strings.Trim(builder.String(), "-_")
	if base == "" || base == "." || base == ".." {
		base = "scenario"
	}
	return filepath.Base(base) + ".yaml"
}

func sentenceCase(value string) string {
	if value == "" {
		return value
	}
	runes := []rune(value)
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}

func toAPILocalScenarioData(descriptor scenario.Descriptor, loaded scenario.Scenario) api.ScenarioData {
	data := toAPIScenarioData(descriptor.ID, loaded)
	data.RelativePath = descriptor.RelativePath
	data.FolderPath = descriptor.FolderPath
	data.SourceFilename = descriptor.SourceFilename
	data.Source = api.ScenarioSourceLocal
	data.SourcePath = descriptor.SourcePath
	data.LocalStatus = api.LocalScenarioStatus(descriptor.LocalStatus)
	return data
}
