package main

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"orson/internal/api"
	"orson/internal/kafka"
	"orson/internal/run"
	"orson/internal/scenario"
)

const runEventName = "run:event"

//go:embed scenarios/order-flow.yaml
var bundledScenarioYAML []byte

// TODO [Scenario]: replace this fixed bundled asset with workspace-selected
// scenario loading when user-owned scenario files are introduced.
const bundledScenarioFilename = "scenarios/order-flow.yaml"

// LoadBundledScenario loads the read-only demo scenario packaged with the
// application. It does not require a Kafka connection.
func (a *App) LoadBundledScenario() api.ScenarioResponse {
	loaded, err := scenario.Load(bundledScenarioFilename, bundledScenarioYAML)
	if err != nil {
		return api.ScenarioFailure(scenarioLoadAPIError(err))
	}

	timeoutSeconds, err := scenario.CaptureTimeoutSeconds(loaded.CaptureTimeout)
	if err != nil {
		return api.ScenarioFailure(api.NewError(
			"scenario_validation_failed",
			"The bundled scenario configuration is invalid.",
			fmt.Sprintf("%s: %v", loaded.SourceFilename, err),
			false,
		))
	}

	warnings := make([]api.ScenarioWarning, 0, len(loaded.Warnings))
	for _, warning := range loaded.Warnings {
		warnings = append(warnings, api.ScenarioWarning{
			Code:           warning.Code,
			Message:        warning.Message,
			SourceFilename: loaded.SourceFilename,
			Line:           warning.Line,
			Column:         warning.Column,
		})
	}

	topology := make([]api.ScenarioTopologyEdge, 0, len(loaded.Topology))
	for _, edge := range loaded.Topology {
		topology = append(topology, api.ScenarioTopologyEdge{
			ID:   edge.ID,
			From: edge.From,
			To:   edge.To,
		})
	}

	return api.ScenarioSuccess(api.ScenarioData{
		Name:              loaded.Name,
		SourceFilename:    loaded.SourceFilename,
		PublishTopic:      loaded.PublishTopic,
		PublishPayload:    loaded.PublishPayload,
		WatchedTopics:     append([]string(nil), loaded.WatchedTopics...),
		CorrelationHeader: loaded.CorrelationHeader,
		CaptureTimeoutSec: timeoutSeconds,
		Topology:          topology,
		Warnings:          warnings,
	})
}

func scenarioLoadAPIError(err error) *api.APIError {
	var loadErr *scenario.LoadError
	if !errors.As(err, &loadErr) {
		return api.NewError(
			"scenario_load_failed",
			"The bundled scenario could not be loaded.",
			err.Error(),
			false,
		)
	}

	code := "scenario_validation_failed"
	message := "The bundled scenario configuration is invalid."
	if loadErr.Stage == "yaml_parse" {
		code = "scenario_parse_failed"
		message = "The bundled scenario YAML could not be parsed."
	}

	fieldErrors := make(map[string]string, len(loadErr.Issues))
	details := make([]string, 0, len(loadErr.Issues))
	for _, issue := range loadErr.Issues {
		location := bundledScenarioFilename
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
		fieldErrors[field] = fmt.Sprintf("%s: %s", location, issue.Message)
		details = append(details, fmt.Sprintf("%s: %s", location, issue.Message))
	}

	apiErr := api.NewError(code, message, strings.Join(details, "\n"), false)
	apiErr.FieldErrors = fieldErrors
	return apiErr
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
		err := coordinator.Run(requestContext, run.RunRequest{
			RunID: runID,
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
			Key:   header.Key,
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
