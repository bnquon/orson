package api

type Workspace struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
	LastOpenedAt string `json:"lastOpenedAt"`
}

type WorkspacePersistenceStatus struct {
	Mode              string `json:"mode"`
	Warning           string `json:"warning,omitempty"`
	RecoveryAvailable bool   `json:"recoveryAvailable"`
	SessionDirty      bool   `json:"sessionDirty"`
}

type WorkspaceBootstrapData struct {
	Workspaces           []Workspace                `json:"workspaces"`
	ActiveWorkspace      Workspace                  `json:"activeWorkspace"`
	BundledScenarios     []ScenarioDescriptor       `json:"bundledScenarios"`
	LocalScenarios       []ScenarioDescriptor       `json:"localScenarios"`
	SelectedScenarioID   string                     `json:"selectedScenarioId,omitempty"`
	SelectedScenario     *ScenarioData              `json:"selectedScenario,omitempty"`
	RememberedConnection *ConnectionInfo            `json:"rememberedConnection,omitempty"`
	Connection           ConnectionState            `json:"connection"`
	Persistence          WorkspacePersistenceStatus `json:"persistence"`
}

type WorkspaceBootstrapResponse struct {
	OK    bool                    `json:"ok"`
	Data  *WorkspaceBootstrapData `json:"data,omitempty"`
	Error *APIError               `json:"error,omitempty"`
}

func WorkspaceBootstrapSuccess(data WorkspaceBootstrapData) WorkspaceBootstrapResponse {
	return WorkspaceBootstrapResponse{OK: true, Data: &data}
}

func WorkspaceBootstrapFailure(err *APIError) WorkspaceBootstrapResponse {
	return WorkspaceBootstrapResponse{Error: err}
}

type WorkspaceSelectionRequest struct {
	WorkspaceID string `json:"workspaceId"`
	Source      string `json:"source"`
	ScenarioID  string `json:"scenarioId"`
}

type WorkspaceActionResponse struct {
	OK          bool                        `json:"ok"`
	Persistence *WorkspacePersistenceStatus `json:"persistence,omitempty"`
	Error       *APIError                   `json:"error,omitempty"`
}

func WorkspaceActionSuccess(persistence WorkspacePersistenceStatus) WorkspaceActionResponse {
	return WorkspaceActionResponse{OK: true, Persistence: &persistence}
}
func WorkspaceActionFailure(err *APIError) WorkspaceActionResponse {
	return WorkspaceActionResponse{Error: err}
}
