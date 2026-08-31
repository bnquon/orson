package main

import (
	"orson/internal/api"
	"orson/internal/scenario"
	workspacepkg "orson/internal/workspace"
)

// scenarioFolderRegistry is the small registry seam needed to project
// workspace folder metadata into the API model. Keeping the projection
// dependent on this interface makes it independent from the registry's
// filesystem and mutation behavior.
type scenarioFolderRegistry interface {
	List() []scenario.Descriptor
	Reference(string) (scenario.LocalReference, error)
}

type scenarioFolderProjector struct {
	registry scenarioFolderRegistry
}

func newScenarioFolderProjector(registry scenarioFolderRegistry) scenarioFolderProjector {
	return scenarioFolderProjector{registry: registry}
}

func (p scenarioFolderProjector) project(state workspacepkg.State, report workspacepkg.FolderDeletionReport) api.ScenarioFolderData {
	workspaceID := state.ActiveWorkspaceID
	refs := make(map[string]workspacepkg.ScenarioReference, len(state.Scenarios[workspaceID]))
	for _, reference := range state.Scenarios[workspaceID] {
		refs[reference.CanonicalPath] = reference
	}

	folderPaths := newScenarioFolderPaths(state.Folders[workspaceID])
	descriptors := p.registry.List()
	localScenarios := make([]api.ScenarioDescriptor, 0, len(descriptors))
	for _, descriptor := range descriptors {
		reference, err := p.registry.Reference(descriptor.ID)
		if err != nil {
			continue
		}

		item := toAPIScenarioDescriptor(descriptor)
		if saved, exists := refs[reference.CanonicalPath]; exists {
			item.FolderID = saved.FolderID
			item.SiblingOrder = saved.SiblingOrder
			item.FolderPath = folderPaths.path(saved.FolderID)
		}
		localScenarios = append(localScenarios, item)
	}

	folders := make([]api.ScenarioFolder, 0, len(state.Folders[workspaceID]))
	for _, folder := range state.Folders[workspaceID] {
		folders = append(folders, api.ScenarioFolder{
			ID:           folder.ID,
			Name:         folder.Name,
			ParentID:     folder.ParentID,
			SiblingOrder: folder.SiblingOrder,
		})
	}

	return api.ScenarioFolderData{
		Folders:     folders,
		Scenarios:   localScenarios,
		Persistence: toAPIPersistence(state.Persistence),
		Summary:     folderMutationSummary(report),
	}
}

func (p scenarioFolderProjector) projectDescriptor(state workspacepkg.State, descriptor scenario.Descriptor) api.ScenarioDescriptor {
	data := p.project(state, workspacepkg.FolderDeletionReport{})
	for _, item := range data.Scenarios {
		if item.ID == descriptor.ID {
			return item
		}
	}
	return toAPIScenarioDescriptor(descriptor)
}

type scenarioFolderPaths struct {
	folders map[string]workspacepkg.Folder
	paths   map[string]string
}

func newScenarioFolderPaths(folders []workspacepkg.Folder) scenarioFolderPaths {
	byID := make(map[string]workspacepkg.Folder, len(folders))
	for _, folder := range folders {
		byID[folder.ID] = folder
	}
	return scenarioFolderPaths{
		folders: byID,
		paths:   make(map[string]string, len(folders)),
	}
}

func (p scenarioFolderPaths) path(folderID string) string {
	if folderID == "" {
		return ""
	}
	if path, exists := p.paths[folderID]; exists {
		return path
	}
	folder, exists := p.folders[folderID]
	if !exists {
		return ""
	}

	parent := p.path(folder.ParentID)
	if parent == "" {
		p.paths[folderID] = folder.Name
	} else {
		p.paths[folderID] = parent + "/" + folder.Name
	}
	return p.paths[folderID]
}

func folderMutationSummary(report workspacepkg.FolderDeletionReport) *api.FolderMutationSummary {
	if len(report.RemovedPaths) == 0 && len(report.SharedPaths) == 0 {
		return nil
	}
	return &api.FolderMutationSummary{
		RemovedScenarioCount: len(report.RemovedPaths),
		SharedFileCount:      len(report.SharedPaths),
	}
}

func (a *App) scenarioFolderData(state workspacepkg.State, report workspacepkg.FolderDeletionReport) api.ScenarioFolderData {
	return newScenarioFolderProjector(a.getLocalScenarioRegistry()).project(state, report)
}

func (a *App) apiLocalScenarioDescriptor(descriptor scenario.Descriptor) api.ScenarioDescriptor {
	state := a.workspaceService().Snapshot()
	return newScenarioFolderProjector(a.getLocalScenarioRegistry()).projectDescriptor(state, descriptor)
}
