package workspace

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

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
