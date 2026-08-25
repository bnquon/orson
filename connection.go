package main

import (
	"context"
	"sync"
	"time"

	"orson/internal/api"
	"orson/internal/kafka"
	"orson/internal/run"
	"orson/internal/scenario"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const connectionBusyCode = "connection_busy"
const runBusyCode = "run_busy"

type KafkaConnection interface {
	run.KafkaClient
	Close()
}

type KafkaConnector interface {
	Connect(context.Context, kafka.Config) (KafkaConnection, error)
}

type runEventEmitter func(context.Context, string, api.RunEvent)

type activeRunState struct {
	id       run.RunID
	cancel   context.CancelFunc
	finished bool
}

type kafkaConnector struct{}

func (kafkaConnector) Connect(ctx context.Context, config kafka.Config) (KafkaConnection, error) {
	return kafka.Connect(ctx, config)
}

type App struct {
	ctx       context.Context
	runCtx    context.Context
	cancelRun context.CancelFunc
	connector KafkaConnector

	lifecycleMu sync.Mutex
	stateMu     sync.Mutex
	runWait     sync.WaitGroup

	activeKafka      KafkaConnection
	activeConnection *api.ConnectionInfo
	coordinator      *run.Coordinator
	activeRuns       int
	activeRun        *activeRunState
	shuttingDown     bool
	latestAttempt    api.ConnectionAttempt
	emitEvent        runEventEmitter
	scenarioCatalog  *scenario.Catalog
}

func NewApp() *App {
	app := newApp(kafkaConnector{})
	app.emitEvent = func(ctx context.Context, name string, event api.RunEvent) {
		runtime.EventsEmit(ctx, name, event)
	}
	return app
}

func newApp(connector KafkaConnector) *App {
	if connector == nil {
		connector = kafkaConnector{}
	}

	return &App{
		connector:       connector,
		scenarioCatalog: scenario.NewCatalog(bundledScenarioFS),
		latestAttempt: api.ConnectionAttempt{
			Status: api.ConnectionStatusDisconnected,
		},
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods and cancel active runs on shutdown.
func (a *App) startup(ctx context.Context) {
	if ctx == nil {
		ctx = context.Background()
	}

	a.stateMu.Lock()
	defer a.stateMu.Unlock()

	a.ctx = ctx
	a.runCtx, a.cancelRun = context.WithCancel(ctx)
}

func (a *App) shutdown(context.Context) {
	a.lifecycleMu.Lock()
	defer a.lifecycleMu.Unlock()

	a.stateMu.Lock()
	a.shuttingDown = true
	activeKafka := a.activeKafka
	a.activeKafka = nil
	a.activeConnection = nil
	a.coordinator = nil
	a.latestAttempt = api.ConnectionAttempt{
		Status: api.ConnectionStatusDisconnected,
	}
	cancelRun := a.cancelRun
	a.stateMu.Unlock()

	if cancelRun != nil {
		cancelRun()
	}

	a.runWait.Wait()

	if activeKafka != nil {
		activeKafka.Close()
	}
}

func (a *App) Connect(request api.ConnectionRequest) api.ConnectionResponse {
	a.lifecycleMu.Lock()
	defer a.lifecycleMu.Unlock()

	a.stateMu.Lock()
	if a.shuttingDown {
		err := api.NewError(
			"app_shutting_down",
			"Orson is shutting down.",
			"Try connecting again after reopening the app.",
			false,
		)
		a.stateMu.Unlock()
		return api.ConnectionFailure(err)
	}
	if a.activeRuns > 0 {
		err := connectionBusyError()
		a.stateMu.Unlock()
		return api.ConnectionFailure(err)
	}

	normalizedRequest := request.Normalize()
	if err := normalizedRequest.Validate(); err != nil {
		apiErr := api.NewError(
			"invalid_connection",
			"The connection details are invalid.",
			err.Error(),
			false,
		)
		a.setAttemptLocked(api.ConnectionStatusFailed, apiErr)
		a.stateMu.Unlock()
		return api.ConnectionFailure(apiErr)
	}

	config := kafka.Config{
		Brokers:     normalizedRequest.Brokers,
		ClientID:    normalizedRequest.ClientID,
		DialTimeout: time.Duration(normalizedRequest.DialTimeoutSeconds) * time.Second,
	}.Normalize()
	if err := config.Validate(); err != nil {
		apiErr := api.NewError(
			"invalid_connection",
			"The connection details are invalid.",
			err.Error(),
			false,
		)
		a.setAttemptLocked(api.ConnectionStatusFailed, apiErr)
		a.stateMu.Unlock()
		return api.ConnectionFailure(apiErr)
	}

	a.setAttemptLocked(api.ConnectionStatusConnecting, nil)
	connectionContext := a.ctx
	if connectionContext == nil {
		connectionContext = context.Background()
	}
	a.stateMu.Unlock()

	candidate, err := a.connector.Connect(connectionContext, config)
	if err != nil {
		apiErr := api.NewError(
			"kafka_connection_failed",
			"Orson could not connect to Kafka.",
			err.Error(),
			true,
		)
		a.stateMu.Lock()
		a.setAttemptLocked(api.ConnectionStatusFailed, apiErr)
		a.stateMu.Unlock()
		return api.ConnectionFailure(apiErr)
	}

	candidateCoordinator, err := run.NewCoordinator(candidate)
	if err != nil {
		candidate.Close()
		apiErr := api.NewError(
			"kafka_connection_failed",
			"Orson could not prepare the Kafka connection.",
			err.Error(),
			true,
		)
		a.stateMu.Lock()
		a.setAttemptLocked(api.ConnectionStatusFailed, apiErr)
		a.stateMu.Unlock()
		return api.ConnectionFailure(apiErr)
	}

	a.stateMu.Lock()
	if a.shuttingDown || a.activeRuns > 0 {
		err := connectionBusyError()
		a.setAttemptLocked(api.ConnectionStatusFailed, err)
		a.stateMu.Unlock()
		candidate.Close()
		return api.ConnectionFailure(err)
	}

	oldConnection := a.activeKafka
	a.activeKafka = candidate
	a.activeConnection = &api.ConnectionInfo{
		Name:               normalizedRequest.Name,
		Brokers:            append([]string(nil), config.Brokers...),
		ClientID:           config.ClientID,
		DialTimeoutSeconds: normalizedRequest.DialTimeoutSeconds,
	}
	a.coordinator = candidateCoordinator
	a.setAttemptLocked(api.ConnectionStatusConnected, nil)
	state := a.connectionStateLocked()
	a.stateMu.Unlock()

	if oldConnection != nil {
		oldConnection.Close()
	}

	return api.ConnectionSuccess(state)
}

func (a *App) Disconnect() api.ConnectionStatusResponse {
	a.lifecycleMu.Lock()
	defer a.lifecycleMu.Unlock()

	a.stateMu.Lock()
	if a.shuttingDown {
		err := api.NewError(
			"app_shutting_down",
			"Orson is shutting down.",
			"Try disconnecting again after reopening the app.",
			false,
		)
		a.stateMu.Unlock()
		return api.ConnectionStatusFailure(err)
	}
	if a.activeRuns > 0 {
		err := connectionBusyError()
		a.stateMu.Unlock()
		return api.ConnectionStatusFailure(err)
	}

	activeKafka := a.activeKafka
	a.activeKafka = nil
	a.activeConnection = nil
	a.coordinator = nil
	a.setAttemptLocked(api.ConnectionStatusDisconnected, nil)
	state := a.connectionStateLocked()
	a.stateMu.Unlock()

	if activeKafka != nil {
		activeKafka.Close()
	}

	return api.ConnectionStatusSuccess(state)
}

func (a *App) GetConnectionStatus() api.ConnectionStatusResponse {
	a.stateMu.Lock()
	defer a.stateMu.Unlock()

	return api.ConnectionStatusSuccess(a.connectionStateLocked())
}

func (a *App) beginRun() (*run.Coordinator, context.Context, run.RunID, *api.APIError) {
	a.stateMu.Lock()
	defer a.stateMu.Unlock()

	if a.shuttingDown {
		return nil, nil, "", connectionBusyError()
	}
	if a.activeRuns > 0 {
		return nil, nil, "", runBusyError()
	}
	if a.coordinator == nil {
		return nil, nil, "", apiConnectionNotConnectedError()
	}

	runContext := a.runCtx
	if runContext == nil {
		runContext = a.ctx
	}
	if runContext == nil {
		runContext = context.Background()
	}

	runID, err := run.NewRunID()
	if err != nil {
		return nil, nil, "", api.NewError(
			"run_start_failed",
			"The run could not be started.",
			err.Error(),
			true,
		)
	}
	runContext, cancel := context.WithCancel(runContext)
	a.activeRuns++
	a.activeRun = &activeRunState{id: runID, cancel: cancel}
	a.runWait.Add(1)
	return a.coordinator, runContext, runID, nil
}

func (a *App) endRun(runID run.RunID) {
	a.stateMu.Lock()
	var cancel context.CancelFunc
	if a.activeRun != nil && a.activeRun.id == runID {
		cancel = a.activeRun.cancel
		a.activeRun = nil
		a.activeRuns--
	}
	a.stateMu.Unlock()
	if cancel != nil {
		cancel()
	}
	a.runWait.Done()
}

func (a *App) setAttemptLocked(status string, err *api.APIError) {
	a.latestAttempt = api.ConnectionAttempt{
		Status: status,
		Error:  err,
	}
}

func (a *App) connectionStateLocked() api.ConnectionState {
	state := api.ConnectionState{
		LatestAttempt: api.ConnectionAttempt{
			Status: a.latestAttempt.Status,
			Error:  cloneAPIError(a.latestAttempt.Error),
		},
	}

	if a.activeConnection != nil {
		active := *a.activeConnection
		active.Brokers = append([]string(nil), a.activeConnection.Brokers...)
		state.Active = &active
	}

	return state
}

func connectionBusyError() *api.APIError {
	return api.NewError(
		connectionBusyCode,
		"The Kafka connection cannot change during an active run.",
		"Wait for the current run to finish, then try again.",
		true,
	)
}

func runBusyError() *api.APIError {
	return api.NewError(
		runBusyCode,
		"A run is already active.",
		"Wait for the current run to finish before starting another.",
		true,
	)
}

func apiConnectionNotConnectedError() *api.APIError {
	return api.NewError(
		"kafka_not_connected",
		"Kafka is not connected.",
		"Connect to Kafka before starting a run.",
		true,
	)
}

func cloneAPIError(err *api.APIError) *api.APIError {
	if err == nil {
		return nil
	}

	clone := *err
	if err.FieldErrors != nil {
		clone.FieldErrors = make(map[string]string, len(err.FieldErrors))
		for field, message := range err.FieldErrors {
			clone.FieldErrors[field] = message
		}
	}

	return &clone
}
