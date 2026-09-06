package workspace

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

func loadState(db *sql.DB) (State, error) {
	state := State{Scenarios: make(map[string][]ScenarioReference), Folders: make(map[string][]Folder), Connections: make(map[string]*ConnectionConfig), Selections: make(map[string]*Selection)}
	rows, err := db.Query(`SELECT id, name, created_at, updated_at, last_opened_at FROM workspaces ORDER BY last_opened_at DESC, created_at ASC, id ASC`)
	if err != nil {
		return State{}, err
	}
	for rows.Next() {
		var item Workspace
		var created, updated, opened string
		if err := rows.Scan(&item.ID, &item.Name, &created, &updated, &opened); err != nil {
			rows.Close()
			return State{}, err
		}
		item.CreatedAt, err = time.Parse(time.RFC3339Nano, created)
		if err == nil {
			item.UpdatedAt, err = time.Parse(time.RFC3339Nano, updated)
		}
		if err == nil {
			item.LastOpenedAt, err = time.Parse(time.RFC3339Nano, opened)
		}
		if err != nil {
			rows.Close()
			return State{}, err
		}
		state.Workspaces = append(state.Workspaces, item)
	}
	if err := rows.Close(); err != nil {
		return State{}, err
	}
	if err := rows.Err(); err != nil {
		return State{}, err
	}
	if err := db.QueryRow(`SELECT value FROM app_state WHERE key = 'active_workspace_id'`).Scan(&state.ActiveWorkspaceID); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return State{}, err
	}
	if state.ActiveWorkspaceID == "" && len(state.Workspaces) > 0 {
		state.ActiveWorkspaceID = state.Workspaces[0].ID
	}
	if len(state.Workspaces) == 0 {
		state.ActiveWorkspaceID = ""
	}
	rows, err = db.Query(`SELECT workspace_id, canonical_path, display_filename, imported_at, fingerprint, modified_at_ns, size_bytes, COALESCE(folder_id, ''), sibling_order FROM workspace_scenarios ORDER BY workspace_id ASC, folder_id ASC, sibling_order ASC, canonical_path ASC`)
	if err != nil {
		return State{}, err
	}
	for rows.Next() {
		var ref ScenarioReference
		var imported string
		if err := rows.Scan(&ref.WorkspaceID, &ref.CanonicalPath, &ref.DisplayFilename, &imported, &ref.Fingerprint, &ref.ModifiedAtNS, &ref.SizeBytes, &ref.FolderID, &ref.SiblingOrder); err != nil {
			rows.Close()
			return State{}, err
		}
		ref.ImportedAt, err = time.Parse(time.RFC3339Nano, imported)
		if err != nil {
			rows.Close()
			return State{}, err
		}
		state.Scenarios[ref.WorkspaceID] = append(state.Scenarios[ref.WorkspaceID], ref)
	}
	if err := rows.Close(); err != nil {
		return State{}, err
	}
	if err := rows.Err(); err != nil {
		return State{}, err
	}
	rows, err = db.Query(`SELECT id, workspace_id, name, COALESCE(parent_id, ''), sibling_order, created_at, updated_at FROM workspace_folders ORDER BY workspace_id ASC, parent_id ASC, sibling_order ASC, id ASC`)
	if err != nil {
		return State{}, err
	}
	for rows.Next() {
		var folder Folder
		var created, updated string
		if err := rows.Scan(&folder.ID, &folder.WorkspaceID, &folder.Name, &folder.ParentID, &folder.SiblingOrder, &created, &updated); err != nil {
			rows.Close()
			return State{}, err
		}
		folder.CreatedAt, err = time.Parse(time.RFC3339Nano, created)
		if err == nil {
			folder.UpdatedAt, err = time.Parse(time.RFC3339Nano, updated)
		}
		if err != nil {
			rows.Close()
			return State{}, err
		}
		state.Folders[folder.WorkspaceID] = append(state.Folders[folder.WorkspaceID], folder)
	}
	if err := rows.Close(); err != nil {
		return State{}, err
	}
	if err := rows.Err(); err != nil {
		return State{}, err
	}
	rows, err = db.Query(`SELECT workspace_id, name, brokers_json, client_id, dial_timeout_seconds, updated_at FROM workspace_connections`)
	if err != nil {
		return State{}, err
	}
	for rows.Next() {
		var config ConnectionConfig
		var brokers, updated string
		if err := rows.Scan(&config.WorkspaceID, &config.Name, &brokers, &config.ClientID, &config.DialTimeoutSeconds, &updated); err != nil {
			rows.Close()
			return State{}, err
		}
		if err := json.Unmarshal([]byte(brokers), &config.Brokers); err != nil {
			rows.Close()
			return State{}, err
		}
		config.UpdatedAt, err = time.Parse(time.RFC3339Nano, updated)
		if err != nil {
			rows.Close()
			return State{}, err
		}
		state.Connections[config.WorkspaceID] = &config
	}
	if err := rows.Close(); err != nil {
		return State{}, err
	}
	if err := rows.Err(); err != nil {
		return State{}, err
	}
	rows, err = db.Query(`SELECT workspace_id, selected_scenario_source, selected_scenario_ref, updated_at FROM workspace_preferences`)
	if err != nil {
		return State{}, err
	}
	for rows.Next() {
		var selection Selection
		var updated string
		if err := rows.Scan(&selection.WorkspaceID, &selection.Source, &selection.Reference, &updated); err != nil {
			rows.Close()
			return State{}, err
		}
		selection.UpdatedAt, err = time.Parse(time.RFC3339Nano, updated)
		if err != nil {
			rows.Close()
			return State{}, err
		}
		state.Selections[selection.WorkspaceID] = &selection
	}
	if err := rows.Close(); err != nil {
		return State{}, err
	}
	if err := rows.Err(); err != nil {
		return State{}, err
	}
	return state, nil
}
