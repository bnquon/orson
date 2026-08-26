package workspace

import "time"

const DefaultName = "My workspace"

type Workspace struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
	LastOpenedAt time.Time `json:"lastOpenedAt"`
}

type ScenarioReference struct {
	WorkspaceID     string    `json:"workspaceId"`
	CanonicalPath   string    `json:"canonicalPath"`
	DisplayFilename string    `json:"displayFilename"`
	ImportedAt      time.Time `json:"importedAt"`
	Fingerprint     string    `json:"fingerprint,omitempty"`
	ModifiedAtNS    int64     `json:"modifiedAtNs,omitempty"`
	SizeBytes       int64     `json:"sizeBytes,omitempty"`
}

type ConnectionConfig struct {
	WorkspaceID        string    `json:"workspaceId"`
	Name               string    `json:"name"`
	Brokers            []string  `json:"brokers"`
	ClientID           string    `json:"clientId"`
	DialTimeoutSeconds int       `json:"dialTimeoutSeconds"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type Selection struct {
	WorkspaceID string    `json:"workspaceId"`
	Source      string    `json:"source"`
	Reference   string    `json:"reference"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type PersistenceStatus struct {
	Mode              string `json:"mode"`
	Warning           string `json:"warning,omitempty"`
	RecoveryAvailable bool   `json:"recoveryAvailable"`
	SessionDirty      bool   `json:"sessionDirty"`
}

type State struct {
	Workspaces        []Workspace
	ActiveWorkspaceID string
	Scenarios         map[string][]ScenarioReference
	Connections       map[string]*ConnectionConfig
	Selections        map[string]*Selection
	Persistence       PersistenceStatus
}

func (s State) ActiveWorkspace() (Workspace, bool) {
	for _, item := range s.Workspaces {
		if item.ID == s.ActiveWorkspaceID {
			return item, true
		}
	}
	return Workspace{}, false
}
