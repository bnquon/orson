package main

import (
	"errors"
	"path/filepath"
	"strings"
	"time"

	"orson/internal/api"
	"orson/internal/scenario"
	workspacepkg "orson/internal/workspace"
)

func hydrateWorkspaceRegistry(state workspacepkg.State) *scenario.LocalRegistry {
	registry := scenario.NewLocalRegistry(nil)
	for _, reference := range state.Scenarios[state.ActiveWorkspaceID] {
		_, _ = registry.Hydrate(reference.CanonicalPath, reference.Fingerprint)
	}
	return registry
}

func (a *App) workspaceService() *workspacepkg.Service {
	a.stateMu.Lock()
	defer a.stateMu.Unlock()
	if a.workspaces == nil {
		a.workspaces = workspacepkg.NewService(workspacepkg.Options{DatabasePath: a.workspacePath})
	}
	return a.workspaces
}

func (a *App) BootstrapWorkspace() api.WorkspaceBootstrapResponse {
	a.lifecycleMu.Lock()
	defer a.lifecycleMu.Unlock()
	a.scenarioOpMu.Lock()
	defer a.scenarioOpMu.Unlock()

	service := a.workspaceService()
	state := service.Snapshot()
	return a.workspaceBootstrapResponse(state)
}

func (a *App) CreateWorkspace(name string) api.WorkspaceBootstrapResponse {
	return a.workspaceTransition(func(service *workspacepkg.Service) (workspacepkg.State, error) {
		return service.Create(name)
	}, workspaceTransitionOptions{effects: workspaceTransitionEffects{disconnect: true, reloadRegistry: true}})
}

func (a *App) RenameWorkspace(id, name string) api.WorkspaceBootstrapResponse {
	return a.workspaceTransition(func(service *workspacepkg.Service) (workspacepkg.State, error) {
		return service.Rename(id, name)
	}, workspaceTransitionOptions{})
}

func (a *App) DeleteWorkspace(id string) api.WorkspaceBootstrapResponse {
	return a.workspaceTransition(func(service *workspacepkg.Service) (workspacepkg.State, error) {
		return service.Delete(id)
	}, workspaceTransitionOptions{
		derive: func(before workspacepkg.State) workspaceTransitionEffects {
			disconnect := before.ActiveWorkspaceID == strings.TrimSpace(id)
			return workspaceTransitionEffects{disconnect: disconnect, reloadRegistry: disconnect}
		},
	})
}

func (a *App) SetActiveWorkspace(id string) api.WorkspaceBootstrapResponse {
	return a.workspaceTransition(func(service *workspacepkg.Service) (workspacepkg.State, error) {
		return service.SetActive(id)
	}, workspaceTransitionOptions{
		derive: func(before workspacepkg.State) workspaceTransitionEffects {
			disconnect := before.ActiveWorkspaceID != strings.TrimSpace(id)
			return workspaceTransitionEffects{disconnect: disconnect, reloadRegistry: disconnect}
		},
	})
}

type workspaceTransitionOptions struct {
	effects workspaceTransitionEffects
	derive  func(workspacepkg.State) workspaceTransitionEffects
}

type workspaceTransitionEffects struct {
	disconnect     bool
	reloadRegistry bool
}

func (a *App) workspaceTransition(change func(*workspacepkg.Service) (workspacepkg.State, error), options workspaceTransitionOptions) api.WorkspaceBootstrapResponse {
	a.lifecycleMu.Lock()
	defer a.lifecycleMu.Unlock()
	a.scenarioOpMu.Lock()
	defer a.scenarioOpMu.Unlock()

	a.stateMu.Lock()
	if a.activeRuns > 0 {
		a.stateMu.Unlock()
		return api.WorkspaceBootstrapFailure(runBusyError())
	}
	if a.shuttingDown {
		a.stateMu.Unlock()
		return api.WorkspaceBootstrapFailure(api.NewError("app_shutting_down", "Orson is shutting down.", "Reopen Orson before changing workspaces.", false))
	}
	a.stateMu.Unlock()

	service := a.workspaceService()
	effects := options.effects
	if options.derive != nil {
		effects = options.derive(service.Snapshot())
	}
	state, err := change(service)
	if err != nil {
		return api.WorkspaceBootstrapFailure(workspaceAPIError(err))
	}
	var registry *scenario.LocalRegistry
	if effects.reloadRegistry {
		registry = hydrateWorkspaceRegistry(state)
	}

	var oldKafka KafkaConnection
	a.stateMu.Lock()
	if registry != nil {
		a.localScenarios = registry
	}
	if effects.disconnect {
		oldKafka = a.activeKafka
		a.activeKafka = nil
		a.activeConnection = nil
		a.coordinator = nil
		a.latestAttempt = api.ConnectionAttempt{Status: api.ConnectionStatusDisconnected}
	}
	a.stateMu.Unlock()
	if oldKafka != nil {
		oldKafka.Close()
	}
	return a.workspaceBootstrapResponse(state)
}

func (a *App) SetWorkspaceSelectedScenario(request api.WorkspaceSelectionRequest) api.WorkspaceActionResponse {
	a.scenarioOpMu.Lock()
	defer a.scenarioOpMu.Unlock()

	service := a.workspaceService()
	state := service.Snapshot()
	if state.ActiveWorkspaceID != strings.TrimSpace(request.WorkspaceID) {
		return api.WorkspaceActionFailure(api.NewError("stale_workspace", "That workspace is no longer active.", "Select the scenario again in the active workspace.", true))
	}

	reference := ""
	source := strings.TrimSpace(request.Source)
	switch source {
	case string(api.ScenarioSourceExample):
		if _, err := a.getScenarioCatalog().Load(strings.TrimSpace(request.ScenarioID)); err != nil {
			return api.WorkspaceActionFailure(api.NewError("stale_scenario", "That scenario is no longer available.", err.Error(), false))
		}
		reference = strings.TrimSpace(request.ScenarioID)
	case string(api.ScenarioSourceLocal):
		localReference, err := a.getLocalScenarioRegistry().Reference(request.ScenarioID)
		if err != nil {
			return api.WorkspaceActionFailure(api.NewError("stale_scenario", "That local scenario is no longer available.", err.Error(), false))
		}
		reference = localReference.CanonicalPath
	default:
		return api.WorkspaceActionFailure(api.NewError("invalid_scenario_source", "The scenario source is invalid.", "Choose a bundled example or local scenario.", false))
	}

	if err := service.SetSelection(workspacepkg.Selection{WorkspaceID: state.ActiveWorkspaceID, Source: source, Reference: reference, UpdatedAt: time.Now().UTC()}); err != nil {
		return api.WorkspaceActionFailure(workspaceAPIError(err))
	}
	persistence := toAPIPersistence(service.Snapshot().Persistence)
	return api.WorkspaceActionSuccess(persistence)
}

func (a *App) RetryWorkspacePersistence(confirmSessionWrite bool) api.WorkspaceBootstrapResponse {
	return a.workspaceTransition(func(service *workspacepkg.Service) (workspacepkg.State, error) {
		return service.Retry(confirmSessionWrite)
	}, workspaceTransitionOptions{effects: workspaceTransitionEffects{disconnect: true, reloadRegistry: true}})
}

func (a *App) workspaceBootstrapResponse(state workspacepkg.State) api.WorkspaceBootstrapResponse {
	active, ok := state.ActiveWorkspace()
	if !ok {
		return api.WorkspaceBootstrapFailure(api.NewError("workspace_bootstrap_failed", "Workspaces could not be loaded.", "No active workspace is available.", true))
	}

	workspaces := make([]api.Workspace, 0, len(state.Workspaces))
	for _, item := range state.Workspaces {
		workspaces = append(workspaces, toAPIWorkspace(item))
	}
	bundledDescriptors, err := a.getScenarioCatalog().List()
	if err != nil {
		return api.WorkspaceBootstrapFailure(scenarioCatalogAPIError(err))
	}
	bundled := make([]api.ScenarioDescriptor, 0, len(bundledDescriptors))
	for _, descriptor := range bundledDescriptors {
		bundled = append(bundled, toAPIScenarioDescriptor(descriptor))
	}
	registry := a.getLocalScenarioRegistry()
	localDescriptors := registry.List()
	locals := make([]api.ScenarioDescriptor, 0, len(localDescriptors))
	for _, descriptor := range localDescriptors {
		locals = append(locals, toAPIScenarioDescriptor(descriptor))
	}

	selectedID, selectedScenario := a.restoreWorkspaceScenario(state, registry, bundledDescriptors, localDescriptors)
	var remembered *api.ConnectionInfo
	if config := state.Connections[state.ActiveWorkspaceID]; config != nil {
		remembered = &api.ConnectionInfo{Name: config.Name, Brokers: append([]string(nil), config.Brokers...), ClientID: config.ClientID, DialTimeoutSeconds: config.DialTimeoutSeconds}
	}
	a.stateMu.Lock()
	connection := a.connectionStateLocked()
	a.stateMu.Unlock()
	persistence := toAPIPersistence(state.Persistence)
	connection.Persistence = &persistence
	return api.WorkspaceBootstrapSuccess(api.WorkspaceBootstrapData{
		Workspaces:           workspaces,
		ActiveWorkspace:      toAPIWorkspace(active),
		BundledScenarios:     bundled,
		LocalScenarios:       locals,
		SelectedScenarioID:   selectedID,
		SelectedScenario:     selectedScenario,
		RememberedConnection: remembered,
		Connection:           connection,
		Persistence:          persistence,
	})
}

func toAPIWorkspace(item workspacepkg.Workspace) api.Workspace {
	return api.Workspace{
		ID:           item.ID,
		Name:         item.Name,
		CreatedAt:    item.CreatedAt.Format(time.RFC3339Nano),
		UpdatedAt:    item.UpdatedAt.Format(time.RFC3339Nano),
		LastOpenedAt: item.LastOpenedAt.Format(time.RFC3339Nano),
	}
}

func (a *App) restoreWorkspaceScenario(state workspacepkg.State, registry *scenario.LocalRegistry, bundled, locals []scenario.Descriptor) (string, *api.ScenarioData) {
	selection := state.Selections[state.ActiveWorkspaceID]
	selectedID := ""
	if selection != nil && selection.Source == string(api.ScenarioSourceLocal) {
		for _, descriptor := range locals {
			if descriptor.SourcePath != selection.Reference {
				continue
			}
			selectedID = descriptor.ID
			if descriptor.Status != scenario.StatusInvalid && descriptor.LocalStatus == scenario.LocalStatusAvailable {
				loadedDescriptor, loaded, err := registry.Load(descriptor.ID)
				if err == nil {
					data := toAPILocalScenarioData(loadedDescriptor, loaded)
					return selectedID, &data
				}
			}
			break
		}
	} else if selection != nil && selection.Source == string(api.ScenarioSourceExample) {
		selectedID = selection.Reference
		if loaded, err := a.getScenarioCatalog().Load(selection.Reference); err == nil {
			data := toAPIScenarioData(loaded.SourceFilename, loaded)
			return selectedID, &data
		}
	}

	var fallback *scenario.Descriptor
	for index := range bundled {
		if bundled[index].ID == "order-flow.yaml" && bundled[index].Status != scenario.StatusInvalid {
			fallback = &bundled[index]
			break
		}
	}
	if fallback == nil {
		for index := range bundled {
			if bundled[index].Status != scenario.StatusInvalid {
				fallback = &bundled[index]
				break
			}
		}
	}
	if fallback == nil {
		return selectedID, nil
	}
	loaded, err := a.getScenarioCatalog().Load(fallback.ID)
	if err != nil {
		return selectedID, nil
	}
	data := toAPIScenarioData(loaded.SourceFilename, loaded)
	if selectedID == "" {
		selectedID = fallback.ID
	}
	return selectedID, &data
}

func toAPIPersistence(status workspacepkg.PersistenceStatus) api.WorkspacePersistenceStatus {
	return api.WorkspacePersistenceStatus{Mode: status.Mode, Warning: status.Warning, RecoveryAvailable: status.RecoveryAvailable, SessionDirty: status.SessionDirty}
}

func workspaceAPIError(err error) *api.APIError {
	switch {
	case errors.Is(err, workspacepkg.ErrWorkspaceNameRequired):
		return api.NewError("workspace_name_required", "Workspace name is required.", err.Error(), false)
	case errors.Is(err, workspacepkg.ErrWorkspaceNameDuplicate):
		return api.NewError("workspace_name_duplicate", "A workspace with that name already exists.", err.Error(), false)
	case errors.Is(err, workspacepkg.ErrFinalWorkspace):
		return api.NewError("final_workspace", "The final workspace cannot be deleted.", err.Error(), false)
	case errors.Is(err, workspacepkg.ErrWorkspaceNotFound):
		return api.NewError("workspace_not_found", "That workspace no longer exists.", err.Error(), false)
	case errors.Is(err, workspacepkg.ErrRecoveryConfirmationRequired):
		return api.NewError("persistence_recovery_confirmation_required", "Confirm recovery before saving session changes.", "Current session workspace state will be written into the recovered database.", true)
	default:
		return api.NewError("workspace_operation_failed", "The workspace operation could not be completed.", err.Error(), true)
	}
}

func workspaceScenarioReference(workspaceID string, descriptor scenario.Descriptor, registry *scenario.LocalRegistry, importedAt time.Time) (workspacepkg.ScenarioReference, error) {
	reference, err := registry.Reference(descriptor.ID)
	if err != nil {
		return workspacepkg.ScenarioReference{}, err
	}
	info, statErr := scenario.OSFileSystem{}.Stat(reference.CanonicalPath)
	result := workspacepkg.ScenarioReference{WorkspaceID: workspaceID, CanonicalPath: reference.CanonicalPath, DisplayFilename: filepath.Base(reference.CanonicalPath), ImportedAt: importedAt, Fingerprint: reference.Fingerprint}
	if statErr == nil {
		result.ModifiedAtNS = info.ModTime().UnixNano()
		result.SizeBytes = info.Size()
	}
	return result, nil
}
