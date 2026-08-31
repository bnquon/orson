package api

type Workspace struct {
	ID                      string `json:"id"`
	Name                    string `json:"name"`
	CreatedAt               string `json:"createdAt"`
	UpdatedAt               string `json:"updatedAt"`
	LastOpenedAt            string `json:"lastOpenedAt"`
	ScenarioCount           int    `json:"scenarioCount"`
	HasRememberedConnection bool   `json:"hasRememberedConnection"`
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
	LocalFolders         []ScenarioFolder           `json:"localFolders"`
	SelectedScenarioID   string                     `json:"selectedScenarioId,omitempty"`
	SelectedScenario     *ScenarioData              `json:"selectedScenario,omitempty"`
	RememberedConnection *ConnectionInfo            `json:"rememberedConnection,omitempty"`
	Connection           ConnectionState            `json:"connection"`
	Persistence          WorkspacePersistenceStatus `json:"persistence"`
}

type ScenarioFolder struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	ParentID     string `json:"parentId,omitempty"`
	SiblingOrder int    `json:"siblingOrder"`
}

type FolderMutationSummary struct {
	RemovedScenarioCount int `json:"removedScenarioCount"`
	SharedFileCount      int `json:"sharedFileCount"`
}

type ScenarioFolderData struct {
	Folders     []ScenarioFolder           `json:"folders"`
	Scenarios   []ScenarioDescriptor       `json:"scenarios"`
	Persistence WorkspacePersistenceStatus `json:"persistence"`
	Summary     *FolderMutationSummary     `json:"summary,omitempty"`
}

type ScenarioFolderResponse struct {
	OK    bool                `json:"ok"`
	Data  *ScenarioFolderData `json:"data,omitempty"`
	Error *APIError           `json:"error,omitempty"`
}

func ScenarioFolderSuccess(data ScenarioFolderData) ScenarioFolderResponse {
	return ScenarioFolderResponse{OK: true, Data: &data}
}

func ScenarioFolderFailure(err *APIError, data *ScenarioFolderData) ScenarioFolderResponse {
	return ScenarioFolderResponse{Data: data, Error: err}
}

type MoveScenarioFolderRequest struct {
	FolderID string `json:"folderId"`
	ParentID string `json:"parentId"`
}

type ReorderScenarioFolderRequest struct {
	FolderID     string `json:"folderId"`
	SiblingIndex int    `json:"siblingIndex"`
}

type MoveLocalScenarioRequest struct {
	ScenarioID   string `json:"scenarioId"`
	FolderID     string `json:"folderId"`
	SiblingIndex int    `json:"siblingIndex"`
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
