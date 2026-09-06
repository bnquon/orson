package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

func replaceState(db *sql.DB, state State) error {
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, table := range []string{"workspace_preferences", "workspace_connections", "workspace_scenarios", "workspace_folders", "app_state"} {
		if _, err := tx.Exec(`DELETE FROM ` + table); err != nil {
			return err
		}
	}
	rows, err := tx.Query(`SELECT id FROM workspaces`)
	if err != nil {
		return err
	}
	existingIDs := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		existingIDs = append(existingIDs, id)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}
	desiredIDs := make(map[string]struct{}, len(state.Workspaces))
	for _, item := range state.Workspaces {
		desiredIDs[item.ID] = struct{}{}
	}
	for _, id := range existingIDs {
		if _, keep := desiredIDs[id]; !keep {
			if _, err := tx.Exec(`DELETE FROM workspaces WHERE id = ?`, id); err != nil {
				return err
			}
		}
	}
	for _, item := range state.Workspaces {
		result, err := tx.Exec(`UPDATE workspaces SET name = ?, name_key = ?, created_at = ?, updated_at = ?, last_opened_at = ? WHERE id = ?`, item.Name, strings.ToLower(strings.TrimSpace(item.Name)), item.CreatedAt.Format(time.RFC3339Nano), item.UpdatedAt.Format(time.RFC3339Nano), item.LastOpenedAt.Format(time.RFC3339Nano), item.ID)
		if err != nil {
			return err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if count == 0 {
			if _, err := tx.Exec(`INSERT INTO workspaces(id, name, name_key, created_at, updated_at, last_opened_at) VALUES(?, ?, ?, ?, ?, ?)`, item.ID, item.Name, strings.ToLower(strings.TrimSpace(item.Name)), item.CreatedAt.Format(time.RFC3339Nano), item.UpdatedAt.Format(time.RFC3339Nano), item.LastOpenedAt.Format(time.RFC3339Nano)); err != nil {
				return err
			}
		}
	}
	if _, err := tx.Exec(`INSERT INTO app_state(key, value) VALUES('active_workspace_id', ?)`, state.ActiveWorkspaceID); err != nil {
		return err
	}
	folders, err := orderedFoldersForPersistence(state.Folders)
	if err != nil {
		return err
	}
	for _, folder := range folders {
		if _, err := tx.Exec(`INSERT INTO workspace_folders(id, workspace_id, name, name_key, parent_id, sibling_order, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, folder.ID, folder.WorkspaceID, folder.Name, strings.ToLower(strings.TrimSpace(folder.Name)), nullString(folder.ParentID), folder.SiblingOrder, folder.CreatedAt.Format(time.RFC3339Nano), folder.UpdatedAt.Format(time.RFC3339Nano)); err != nil {
			return err
		}
	}
	for _, items := range state.Scenarios {
		for _, ref := range items {
			if _, err := tx.Exec(`INSERT INTO workspace_scenarios(workspace_id, canonical_path, display_filename, imported_at, fingerprint, modified_at_ns, size_bytes, folder_id, sibling_order) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`, ref.WorkspaceID, ref.CanonicalPath, ref.DisplayFilename, ref.ImportedAt.Format(time.RFC3339Nano), ref.Fingerprint, ref.ModifiedAtNS, ref.SizeBytes, nullString(ref.FolderID), ref.SiblingOrder); err != nil {
				return err
			}
		}
	}
	for _, config := range state.Connections {
		brokers, err := json.Marshal(config.Brokers)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO workspace_connections(workspace_id, name, brokers_json, client_id, dial_timeout_seconds, updated_at) VALUES(?, ?, ?, ?, ?, ?)`, config.WorkspaceID, config.Name, string(brokers), config.ClientID, config.DialTimeoutSeconds, config.UpdatedAt.Format(time.RFC3339Nano)); err != nil {
			return err
		}
	}
	for _, selection := range state.Selections {
		if _, err := tx.Exec(`INSERT INTO workspace_preferences(workspace_id, selected_scenario_source, selected_scenario_ref, updated_at) VALUES(?, ?, ?, ?)`, selection.WorkspaceID, selection.Source, selection.Reference, selection.UpdatedAt.Format(time.RFC3339Nano)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func orderedFoldersForPersistence(foldersByWorkspace map[string][]Folder) ([]Folder, error) {
	pending := make(map[string][]Folder, len(foldersByWorkspace))
	inserted := make(map[string]map[string]struct{}, len(foldersByWorkspace))
	remaining := 0
	for workspaceID, folders := range foldersByWorkspace {
		pending[workspaceID] = append([]Folder(nil), folders...)
		inserted[workspaceID] = make(map[string]struct{}, len(folders))
		remaining += len(folders)
	}

	ordered := make([]Folder, 0, remaining)
	for remaining > 0 {
		progressed := false
		for workspaceID, folders := range pending {
			next := make([]Folder, 0, len(folders))
			for _, folder := range folders {
				if folder.ParentID != "" {
					if _, exists := inserted[workspaceID][folder.ParentID]; !exists {
						next = append(next, folder)
						continue
					}
				}
				ordered = append(ordered, folder)
				inserted[workspaceID][folder.ID] = struct{}{}
				remaining--
				progressed = true
			}
			if len(next) == 0 {
				delete(pending, workspaceID)
			} else {
				pending[workspaceID] = next
			}
		}
		if !progressed {
			return nil, errors.New("folder hierarchy contains a missing parent or cycle")
		}
	}
	return ordered, nil
}

func nullString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}
