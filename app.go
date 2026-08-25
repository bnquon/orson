package main

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"path"
	"strconv"
	"strings"
	"time"

	"orson/internal/api"
	"orson/internal/kafka"
	"orson/internal/run"
	"orson/internal/scenario"
)

const runEventName = "run:event"

//go:embed all:scenarios
var bundledScenarios embed.FS

var bundledScenarioFS = mustScenarioFS()

func mustScenarioFS() fs.FS {
	root, err := fs.Sub(bundledScenarios, "scenarios")
	if err != nil {
		panic(err)
	}
	return root
}

// ListBundledScenarios discovers and independently validates the read-only
// scenario files packaged with the application. It does not require Kafka.
func (a *App) ListBundledScenarios() api.ScenarioListResponse {
	descriptors, err := a.getScenarioCatalog().List()
	if err != nil {
		return api.ScenarioListFailure(scenarioCatalogAPIError(err))
	}

	items := make([]api.ScenarioDescriptor, 0, len(descriptors))
	for _, descriptor := range descriptors {
		items = append(items, toAPIScenarioDescriptor(descriptor))
	}
	return api.ScenarioListSuccess(api.ScenarioListData{Scenarios: items})
}

// LoadBundledScenario loads one validated read-only scenario by its stable
// catalog ID. It does not require Kafka.
func (a *App) LoadBundledScenario(id string) api.ScenarioResponse {
	loaded, err := a.getScenarioCatalog().Load(id)
	if err != nil {
		return api.ScenarioFailure(scenarioLoadAPIError(err))
	}
	return api.ScenarioSuccess(toAPIScenarioData(loaded.SourceFilename, loaded))
}

func (a *App) getScenarioCatalog() *scenario.Catalog {
	if a.scenarioCatalog != nil {
		return a.scenarioCatalog
	}
	return scenario.NewCatalog(bundledScenarioFS)
}

func scenarioCatalogAPIError(err error) *api.APIError {
	return api.NewError(
		"scenario_catalog_failed",
		"The bundled scenario catalog could not be loaded.",
		err.Error(),
		true,
	)
}

func scenarioLoadAPIError(err error) *api.APIError {
	var catalogErr *scenario.CatalogError
	if errors.As(err, &catalogErr) {
		if catalogErr.Descriptor != nil {
			return descriptorAPIError(catalogErr.Descriptor)
		}
		message := "The selected scenario could not be loaded."
		if catalogErr.Code == "scenario_not_found" {
			message = "That bundled scenario was not found."
		}
		details := catalogErr.Error()
		if catalogErr.ID != "" {
			details = fmt.Sprintf("%s: %s", catalogErr.ID, details)
		}
		return api.NewError(catalogErr.Code, message, details, false)
	}

	var loadErr *scenario.LoadError
	if !errors.As(err, &loadErr) {
		return api.NewError(
			"scenario_load_failed",
			"The selected scenario could not be loaded.",
			err.Error(),
			false,
		)
	}

	code := "scenario_validation_failed"
	message := "The selected scenario configuration is invalid."
	if loadErr.Stage == "yaml_parse" {
		code = "scenario_parse_failed"
		message = "The selected scenario YAML could not be parsed."
	}

	issues := make([]apiScenarioIssue, 0, len(loadErr.Issues))
	for _, issue := range loadErr.Issues {
		issues = append(issues, apiScenarioIssue{
			Code:    issue.Code,
			Path:    issue.Path,
			Message: issue.Message,
			Details: issue.Details,
			Line:    issue.Line,
			Column:  issue.Column,
		})
	}

	return scenarioIssuesAPIError(code, message, issues)
}

func descriptorAPIError(descriptor *scenario.Descriptor) *api.APIError {
	code := "scenario_validation_failed"
	issues := make([]apiScenarioIssue, 0, len(descriptor.Diagnostics))
	for _, diagnostic := range descriptor.Diagnostics {
		if diagnostic.Code == "yaml_decode_failed" || diagnostic.Code == "unknown_yaml_field" {
			code = "scenario_parse_failed"
		}
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
	message := "The selected scenario configuration is invalid."
	if code == "scenario_parse_failed" {
		message = "The selected scenario YAML could not be parsed."
	}
	return scenarioIssuesAPIError(code, message, issues)
}

type apiScenarioIssue struct {
	Code           string
	Path           string
	Message        string
	Details        string
	SourceFilename string
	Line           int
	Column         int
}

func scenarioIssuesAPIError(code, message string, issues []apiScenarioIssue) *api.APIError {
	details := make([]string, 0, len(issues))
	fieldErrors := make(map[string]string, len(issues))
	for _, issue := range issues {
		location := issue.SourceFilename
		if location == "" {
			location = issue.Path
		}
		if location == "" {
			location = "selected scenario"
		}
		if issue.Line > 0 {
			location += fmt.Sprintf(":%d", issue.Line)
			if issue.Column > 0 {
				location += fmt.Sprintf(":%d", issue.Column)
			}
		}
		field := issue.Path
		if field == "" {
			field = issue.Code
		}
		formatted := fmt.Sprintf("%s: %s", location, issue.Message)
		fieldErrors[field] = formatted
		if issue.Details != "" && issue.Details != issue.Message {
			details = append(details, fmt.Sprintf("%s (%s)", formatted, issue.Details))
		} else {
			details = append(details, formatted)
		}
	}

	apiErr := api.NewError(code, message, strings.Join(details, "\n"), false)
	apiErr.FieldErrors = fieldErrors
	return apiErr
}

func toAPIScenarioDescriptor(descriptor scenario.Descriptor) api.ScenarioDescriptor {
	diagnostics := make([]api.ScenarioDiagnostic, 0, len(descriptor.Diagnostics))
	for _, diagnostic := range descriptor.Diagnostics {
		diagnostics = append(diagnostics, api.ScenarioDiagnostic{
			Code:           diagnostic.Code,
			Path:           diagnostic.Path,
			Message:        diagnostic.Message,
			Details:        diagnostic.Details,
			SourceFilename: diagnostic.SourceFilename,
			Line:           diagnostic.Line,
			Column:         diagnostic.Column,
		})
	}

	return api.ScenarioDescriptor{
		ID:             descriptor.ID,
		DisplayName:    descriptor.DisplayName,
		RelativePath:   descriptor.RelativePath,
		FolderPath:     descriptor.FolderPath,
		SourceFilename: descriptor.SourceFilename,
		Source:         apiScenarioSource(descriptor.Source),
		SourcePath:     descriptor.SourcePath,
		LocalStatus:    api.LocalScenarioStatus(descriptor.LocalStatus),
		Status:         api.ScenarioStatus(descriptor.Status),
		Warnings:       toAPIWarnings(descriptor.Warnings, descriptor.SourceFilename),
		Diagnostics:    diagnostics,
	}
}

func toAPIScenarioData(id string, loaded scenario.Scenario) api.ScenarioData {
	timeoutSeconds, _ := scenario.CaptureTimeoutSeconds(loaded.CaptureTimeout)
	topology := make([]api.ScenarioTopologyEdge, 0, len(loaded.Topology))
	for _, edge := range loaded.Topology {
		topology = append(topology, api.ScenarioTopologyEdge{
			ID:   edge.ID,
			From: edge.From,
			To:   edge.To,
		})
	}
	configuredTopology := make([]api.ScenarioTopologyEdge, 0, len(loaded.ConfiguredTopology))
	for _, edge := range loaded.ConfiguredTopology {
		configuredTopology = append(configuredTopology, api.ScenarioTopologyEdge{
			ID:   edge.ID,
			From: edge.From,
			To:   edge.To,
		})
	}
	headers := make([]api.Header, 0, len(loaded.Headers))
	for _, header := range loaded.Headers {
		headers = append(headers, api.Header{Key: header.Key, Value: header.Value})
	}

	folder := path.Dir(loaded.SourceFilename)
	if folder == "." {
		folder = ""
	}
	return api.ScenarioData{
		ID:                 id,
		RelativePath:       loaded.SourceFilename,
		FolderPath:         folder,
		Name:               loaded.Name,
		SourceFilename:     loaded.SourceFilename,
		Source:             api.ScenarioSourceExample,
		PublishTopic:       loaded.PublishTopic,
		PublishPayload:     loaded.PublishPayload,
		MessageKey:         loaded.MessageKey,
		Headers:            headers,
		WatchedTopics:      append([]string(nil), loaded.WatchedTopics...),
		CorrelationHeader:  loaded.CorrelationHeader,
		CaptureTimeoutSec:  timeoutSeconds,
		Topology:           topology,
		ConfiguredTopology: configuredTopology,
		Warnings:           toAPIWarnings(loaded.Warnings, loaded.SourceFilename),
	}
}

func toAPIWarnings(source []scenario.Warning, filename string) []api.ScenarioWarning {
	warnings := make([]api.ScenarioWarning, 0, len(source))
	for _, warning := range source {
		warnings = append(warnings, api.ScenarioWarning{
			Code:           warning.Code,
			Path:           warning.Path,
			Message:        warning.Message,
			SourceFilename: filename,
			Line:           warning.Line,
			Column:         warning.Column,
		})
	}
	return warnings
}

func apiScenarioSource(source scenario.Source) api.ScenarioSource {
	if source == scenario.SourceLocal {
		return api.ScenarioSourceLocal
	}
	return api.ScenarioSourceExample
}

// StartRun validates and registers a run, then returns its ID before Kafka
// capture or publishing completes. Runtime failures are delivered as events.
func (a *App) StartRun(request api.RunRequest) api.RunStartResponse {
	if err := request.Validate(); err != nil {
		return api.RunStartFailure(api.NewError(
			"invalid_request",
			"The run configuration is invalid.",
			err.Error(),
			false,
		))
	}

	coordinator, requestContext, runID, apiErr := a.beginRun()
	if apiErr != nil {
		return api.RunStartFailure(apiErr)
	}

	go func() {
		defer a.endRun(runID)
		correlationHeader := request.ResolvedCorrelationHeader()
		err := coordinator.Run(requestContext, run.RunRequest{
			RunID:             runID,
			CorrelationHeader: correlationHeader,
			RootMessage: kafka.Message{
				Topic:   request.RootTopic,
				Key:     []byte(request.MessageKey),
				Value:   []byte(request.Payload),
				Headers: toKafkaHeaders(request.Headers),
			},
			WatchedTopics:  request.WatchedTopics,
			CaptureTimeout: time.Duration(request.CaptureTimeoutSeconds) * time.Second,
		}, a.emitRunEvent)
		if err != nil {
			log.Printf("run failed before terminal event: %v", err)
		}
	}()

	return api.RunStartSuccess(string(runID))
}

// StopRun requests cancellation of the active run. The terminal state is
// delivered asynchronously through run:event.
func (a *App) StopRun(runID string) api.RunControlResponse {
	runID = strings.TrimSpace(runID)

	a.stateMu.Lock()
	active := a.activeRun
	if active == nil || string(active.id) != runID || active.finished {
		a.stateMu.Unlock()
		return api.RunControlFailure(api.NewError(
			"run_not_active",
			"That run is no longer active.",
			"Start a new run before trying to stop it.",
			false,
		))
	}
	active.cancel()
	a.stateMu.Unlock()

	return api.RunControlSuccess()
}

func (a *App) emitRunEvent(event run.Event) {
	payload := api.RunEvent{
		RunID:    string(event.RunID),
		Sequence: event.Sequence,
		Kind:     string(event.Kind),
		Status:   string(event.Status),
	}
	if event.Record != nil {
		record := toAPIRecord(*event.Record)
		payload.Record = &record
	}
	if event.Failure != nil {
		payload.Error = runFailureAPIError(event.Failure)
	}

	a.stateMu.Lock()
	if event.Kind == run.EventFinished && a.activeRun != nil && a.activeRun.id == event.RunID {
		a.activeRun.finished = true
	}
	ctx := a.ctx
	emitter := a.emitEvent
	a.stateMu.Unlock()
	if ctx == nil {
		ctx = context.Background()
	}
	if emitter != nil {
		emitter(ctx, runEventName, payload)
	}
}

func runFailureAPIError(failure *run.Failure) *api.APIError {
	if failure == nil {
		return nil
	}

	code := "run_failed"
	message := "The event run could not be completed."
	switch failure.Stage {
	case run.FailureStageTimeout, run.FailureStageCancellation:
		return nil
	case run.FailureStagePublish:
		code = "publish_failed"
		message = "The root event could not be published."
	case run.FailureStageCapture:
		code = "capture_failed"
		message = "Kafka capture could not be completed."
	case run.FailureStageProcessing:
		code = "processing_failed"
		message = "The event run could not be processed."
	}

	details := failure.Error()
	return api.NewError(code, message, details, true)
}

func toKafkaHeaders(headers []api.Header) []kafka.Header {
	converted := make([]kafka.Header, 0, len(headers))
	for _, header := range headers {
		converted = append(converted, kafka.Header{
			Key:   strings.TrimSpace(header.Key),
			Value: []byte(header.Value),
		})
	}

	return converted
}

func toAPIRecord(record kafka.Record) api.EventRecord {
	headers := make([]api.Header, 0, len(record.Message.Headers))
	for _, header := range record.Message.Headers {
		headers = append(headers, api.Header{
			Key:   header.Key,
			Value: string(header.Value),
		})
	}

	return api.EventRecord{
		Topic:     record.Message.Topic,
		Key:       string(record.Message.Key),
		Value:     string(record.Message.Value),
		Headers:   headers,
		Partition: record.Partition,
		Offset:    strconv.FormatInt(record.Offset, 10),
		Timestamp: record.Timestamp.UTC().Format(time.RFC3339Nano),
	}
}
