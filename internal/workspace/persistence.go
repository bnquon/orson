package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

func openSQLite(path string) (*sql.DB, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("workspace database path is empty")
	}
	if path != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			return nil, err
		}
	}
	dsn := ":memory:?_foreign_keys=on&_busy_timeout=5000"
	if path != ":memory:" {
		dsn = (&url.URL{Scheme: "file", Path: path}).String() + "?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000"
	}
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func (s *Service) initialize() {
	db, err := s.open(s.path)
	if err == nil {
		err = migrate(db, s.now())
	}
	if err == nil {
		var state State
		state, err = loadState(db)
		if err == nil {
			state.Persistence = persistentStatus()
			s.db = db
			s.state = state
			return
		}
	}
	if db != nil {
		_ = db.Close()
	}
	s.state = s.emptyState()
	s.state.Persistence = fallbackStatus(err, false)
}

func persistentStatus() PersistenceStatus {
	return PersistenceStatus{Mode: "persistent"}
}

func fallbackStatus(err error, dirty bool) PersistenceStatus {
	warning := sessionWarning
	if err != nil {
		warning += " " + err.Error()
	}
	return PersistenceStatus{Mode: "session_only", Warning: warning, RecoveryAvailable: true, SessionDirty: dirty}
}

func (s *Service) commit(next State, operation string) {
	if s.db != nil {
		if err := replaceState(s.db, next); err == nil {
			next.Persistence = persistentStatus()
			s.state = next
			return
		} else {
			_ = s.db.Close()
			s.db = nil
			next.Persistence = fallbackStatus(fmt.Errorf("%s could not be persisted: %w", operation, err), true)
			s.state = next
			return
		}
	}
	next.Persistence = fallbackStatus(nil, true)
	s.state = next
}

func (s *Service) Retry(confirm bool) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil {
		return cloneState(s.state), nil
	}
	if s.state.Persistence.SessionDirty && !confirm {
		return State{}, ErrRecoveryConfirmationRequired
	}
	db, err := s.open(s.path)
	if err == nil {
		err = migrate(db, s.now())
	}
	if err != nil {
		if db != nil {
			_ = db.Close()
		}
		s.state.Persistence = fallbackStatus(err, s.state.Persistence.SessionDirty)
		return State{}, err
	}
	if !s.state.Persistence.SessionDirty {
		state, loadErr := loadState(db)
		if loadErr != nil {
			_ = db.Close()
			return State{}, loadErr
		}
		if len(state.Workspaces) == 0 {
			state = s.emptyState()
		}
		state.Persistence = persistentStatus()
		s.db = db
		s.state = state
		return cloneState(state), nil
	}
	durable, err := loadState(db)
	if err != nil {
		_ = db.Close()
		return State{}, err
	}
	merged := mergeRecovered(durable, s.state, s.deletedIDs, s.now())
	if err := replaceState(db, merged); err != nil {
		_ = db.Close()
		return State{}, err
	}
	merged.Persistence = persistentStatus()
	s.db = db
	s.state = merged
	s.deletedIDs = make(map[string]struct{})
	return cloneState(merged), nil
}

func (s *Service) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return nil
	}
	err := s.db.Close()
	s.db = nil
	return err
}

func migrate(db *sql.DB, now time.Time) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		return err
	}
	var latest int
	if err := db.QueryRow(`SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&latest); err != nil {
		return err
	}
	if latest > 3 {
		return fmt.Errorf("workspace database version %d is newer than supported version 3", latest)
	}
	if latest == 0 {
		if err := applyMigration(db, 1, now, []string{
			`CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_opened_at TEXT NOT NULL)`,
			`CREATE TABLE workspace_scenarios (workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, canonical_path TEXT NOT NULL, display_filename TEXT NOT NULL, imported_at TEXT NOT NULL, fingerprint TEXT NOT NULL DEFAULT '', modified_at_ns INTEGER NOT NULL DEFAULT 0, size_bytes INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (workspace_id, canonical_path))`,
			`CREATE TABLE workspace_connections (workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE, name TEXT NOT NULL, brokers_json TEXT NOT NULL, client_id TEXT NOT NULL, dial_timeout_seconds INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
			`CREATE TABLE workspace_preferences (workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE, selected_scenario_source TEXT NOT NULL, selected_scenario_ref TEXT NOT NULL, updated_at TEXT NOT NULL)`,
			`CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
		}); err != nil {
			return err
		}
		latest = 1
	}
	if latest == 1 {
		if err := applyMigration(db, 2, now, []string{
			`CREATE TABLE run_history (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
				scenario_source TEXT NOT NULL,
				scenario_reference TEXT NOT NULL,
				scenario_display_name TEXT NOT NULL,
				scenario_snapshot_json TEXT NOT NULL,
				root_topic TEXT NOT NULL,
				status TEXT NOT NULL,
				started_at TEXT NOT NULL,
				finished_at TEXT NOT NULL,
				duration_ns INTEGER NOT NULL,
				event_count INTEGER NOT NULL,
				failure_stage TEXT,
				failure_message TEXT,
				connection_name TEXT NOT NULL,
				tracked_topics_json TEXT NOT NULL
			)`,
			`CREATE INDEX run_history_workspace_finished_idx ON run_history(workspace_id, finished_at DESC, id ASC)`,
			`CREATE TABLE run_history_records (
				run_id TEXT NOT NULL REFERENCES run_history(id) ON DELETE CASCADE,
				sequence INTEGER NOT NULL,
				kind TEXT NOT NULL,
				is_root INTEGER NOT NULL CHECK(is_root IN (0, 1)),
				topic TEXT NOT NULL,
				message_key BLOB NOT NULL,
				payload BLOB NOT NULL,
				headers_json TEXT NOT NULL,
				partition INTEGER NOT NULL,
				offset INTEGER NOT NULL,
				record_timestamp TEXT NOT NULL,
				PRIMARY KEY (run_id, sequence)
			)`,
			`CREATE INDEX run_history_records_order_idx ON run_history_records(run_id, sequence ASC)`,
		}); err != nil {
			return err
		}
		latest = 2
	}
	if latest == 2 {
		return applyFolderMigration(db, now)
	}
	return nil
}

func applyFolderMigration(db *sql.DB, now time.Time) error {
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, statement := range []string{
		`CREATE TABLE workspace_folders (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			name_key TEXT NOT NULL,
			parent_id TEXT REFERENCES workspace_folders(id) ON DELETE CASCADE,
			sibling_order INTEGER NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE UNIQUE INDEX workspace_folders_sibling_name_idx ON workspace_folders(workspace_id, COALESCE(parent_id, ''), name_key)`,
		`ALTER TABLE workspace_scenarios ADD COLUMN folder_id TEXT REFERENCES workspace_folders(id) ON DELETE SET NULL`,
		`ALTER TABLE workspace_scenarios ADD COLUMN sibling_order INTEGER NOT NULL DEFAULT 0`,
		`CREATE INDEX workspace_folders_workspace_parent_order_idx ON workspace_folders(workspace_id, parent_id, sibling_order, id)`,
		`CREATE INDEX workspace_scenarios_workspace_folder_order_idx ON workspace_scenarios(workspace_id, folder_id, sibling_order, canonical_path)`,
	} {
		if _, err := tx.Exec(statement); err != nil {
			return err
		}
	}
	rows, err := tx.Query(`SELECT workspace_id, canonical_path FROM workspace_scenarios ORDER BY workspace_id ASC, LOWER(display_filename) ASC, LOWER(canonical_path) ASC, canonical_path ASC`)
	if err != nil {
		return err
	}
	orders := make(map[string]int)
	for rows.Next() {
		var workspaceID, canonicalPath string
		if err := rows.Scan(&workspaceID, &canonicalPath); err != nil {
			rows.Close()
			return err
		}
		order := orders[workspaceID]
		if _, err := tx.Exec(`UPDATE workspace_scenarios SET folder_id = NULL, sibling_order = ? WHERE workspace_id = ? AND canonical_path = ?`, order, workspaceID, canonicalPath); err != nil {
			rows.Close()
			return err
		}
		orders[workspaceID] = order + 1
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO schema_migrations(version, applied_at) VALUES(3, ?)`, now.Format(time.RFC3339Nano)); err != nil {
		return err
	}
	return tx.Commit()
}

func applyMigration(db *sql.DB, version int, now time.Time, statements []string) error {
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, statement := range statements {
		if _, err := tx.Exec(statement); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)`, version, now.Format(time.RFC3339Nano)); err != nil {
		return err
	}
	return tx.Commit()
}

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
	_ = db.QueryRow(`SELECT value FROM app_state WHERE key = 'active_workspace_id'`).Scan(&state.ActiveWorkspaceID)
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
	return state, nil
}

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
