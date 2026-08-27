package workspace

import (
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func testService(t *testing.T) *Service {
	t.Helper()
	service := NewService(Options{DatabasePath: filepath.Join(t.TempDir(), "orson.db")})
	if _, err := service.Create("Test workspace"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = service.Close() })
	return service
}

func TestDatabaseMigrationStartsWithoutWorkspace(t *testing.T) {
	path := filepath.Join(t.TempDir(), "orson.db")
	service := NewService(Options{DatabasePath: path})
	state := service.Snapshot()
	if state.Persistence.Mode != "persistent" || len(state.Workspaces) != 0 || state.ActiveWorkspaceID != "" {
		t.Fatalf("initial state = %+v", state)
	}
	if err := service.Close(); err != nil {
		t.Fatal(err)
	}
	db, err := openSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var version int
	if err := db.QueryRow(`SELECT MAX(version) FROM schema_migrations`).Scan(&version); err != nil || version != 2 {
		t.Fatalf("migration version = %d, err = %v", version, err)
	}
}

func TestDatabaseMigrationUpgradesVersionOneWithRunHistory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "orson.db")
	db, err := openSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 8, 26, 12, 0, 0, 0, time.UTC)
	if _, err := db.Exec(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if err := applyMigration(db, 1, now, []string{
		`CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_opened_at TEXT NOT NULL)`,
		`CREATE TABLE workspace_scenarios (workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, canonical_path TEXT NOT NULL, display_filename TEXT NOT NULL, imported_at TEXT NOT NULL, fingerprint TEXT NOT NULL DEFAULT '', modified_at_ns INTEGER NOT NULL DEFAULT 0, size_bytes INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (workspace_id, canonical_path))`,
		`CREATE TABLE workspace_connections (workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE, name TEXT NOT NULL, brokers_json TEXT NOT NULL, client_id TEXT NOT NULL, dial_timeout_seconds INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE workspace_preferences (workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE, selected_scenario_source TEXT NOT NULL, selected_scenario_ref TEXT NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
	}); err != nil {
		db.Close()
		t.Fatal(err)
	}
	createdAt := now.Format(time.RFC3339Nano)
	if _, err := db.Exec(`INSERT INTO workspaces(id, name, name_key, created_at, updated_at, last_opened_at) VALUES('legacy', 'Legacy', 'legacy', ?, ?, ?); INSERT INTO app_state(key, value) VALUES('active_workspace_id', 'legacy')`, createdAt, createdAt, createdAt); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	service := NewService(Options{DatabasePath: path})
	defer service.Close()
	state := service.Snapshot()
	if state.Persistence.Mode != "persistent" || state.ActiveWorkspaceID != "legacy" {
		t.Fatalf("upgraded state = %+v", state)
	}

	db, err = openSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var version int
	if err := db.QueryRow(`SELECT MAX(version) FROM schema_migrations`).Scan(&version); err != nil || version != 2 {
		t.Fatalf("migration version = %d, err = %v", version, err)
	}
	var tableName string
	if err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'run_history'`).Scan(&tableName); err != nil || tableName != "run_history" {
		t.Fatalf("run history table = %q, err = %v", tableName, err)
	}
}

func TestWorkspaceCRUDOrderingAndEmptyState(t *testing.T) {
	service := testService(t)
	state, err := service.Create("  SECOND  ")
	if err != nil {
		t.Fatal(err)
	}
	secondID := state.ActiveWorkspaceID
	if state.Workspaces[0].ID != secondID || state.Workspaces[0].Name != "SECOND" {
		t.Fatalf("create state = %+v", state.Workspaces)
	}
	if _, err := service.Create("second"); !errors.Is(err, ErrWorkspaceNameDuplicate) {
		t.Fatalf("duplicate error = %v", err)
	}
	if _, err := service.Rename(secondID, "   "); !errors.Is(err, ErrWorkspaceNameRequired) {
		t.Fatalf("blank rename error = %v", err)
	}
	state, err = service.Delete(secondID)
	if err != nil {
		t.Fatal(err)
	}
	if state.ActiveWorkspaceID == secondID || len(state.Workspaces) != 1 {
		t.Fatalf("delete state = %+v", state)
	}
	state, err = service.Delete(state.ActiveWorkspaceID)
	if err != nil {
		t.Fatal(err)
	}
	if len(state.Workspaces) != 0 || state.ActiveWorkspaceID != "" {
		t.Fatalf("empty delete state = %+v", state)
	}
}

func TestScenarioAssociationsAreWorkspaceScoped(t *testing.T) {
	service := testService(t)
	state := service.Snapshot()
	firstID := state.ActiveWorkspaceID
	state, err := service.Create("Second")
	if err != nil {
		t.Fatal(err)
	}
	secondID := state.ActiveWorkspaceID
	now := time.Now().UTC()
	for _, workspaceID := range []string{firstID, secondID} {
		if err := service.UpsertScenario(ScenarioReference{WorkspaceID: workspaceID, CanonicalPath: "/tmp/order.yaml", DisplayFilename: "order.yaml", ImportedAt: now, Fingerprint: workspaceID}); err != nil {
			t.Fatal(err)
		}
	}
	if err := service.UpsertScenario(ScenarioReference{WorkspaceID: secondID, CanonicalPath: "/tmp/order.yaml", DisplayFilename: "order.yaml", ImportedAt: now.Add(time.Hour), Fingerprint: "updated"}); err != nil {
		t.Fatal(err)
	}
	state = service.Snapshot()
	if len(state.Scenarios[firstID]) != 1 || len(state.Scenarios[secondID]) != 1 || state.Scenarios[secondID][0].Fingerprint != "updated" {
		t.Fatalf("scenario state = %+v", state.Scenarios)
	}
	if !state.Scenarios[secondID][0].ImportedAt.Equal(now) {
		t.Fatalf("duplicate import changed imported timestamp")
	}
}

func TestRemoveScenarioOnlyRemovesTheWorkspaceAssociation(t *testing.T) {
	service := testService(t)
	first := service.Snapshot().ActiveWorkspaceID
	state, err := service.Create("Second")
	if err != nil {
		t.Fatal(err)
	}
	second := state.ActiveWorkspaceID
	for _, workspaceID := range []string{first, second} {
		if err := service.UpsertScenario(ScenarioReference{
			WorkspaceID: workspaceID, CanonicalPath: "/tmp/shared.yaml", DisplayFilename: "shared.yaml",
			ImportedAt: time.Now().UTC(), Fingerprint: workspaceID,
		}); err != nil {
			t.Fatal(err)
		}
	}
	if err := service.SetSelection(Selection{WorkspaceID: second, Source: "local", Reference: "/tmp/shared.yaml"}); err != nil {
		t.Fatal(err)
	}
	if err := service.RemoveScenario(second, "/tmp/shared.yaml"); err != nil {
		t.Fatal(err)
	}
	state = service.Snapshot()
	if len(state.Scenarios[second]) != 0 || state.Selections[second] != nil {
		t.Fatalf("removed workspace still has scenario state: %+v / %+v", state.Scenarios, state.Selections)
	}
	if len(state.Scenarios[first]) != 1 {
		t.Fatalf("other workspace association was removed: %+v", state.Scenarios)
	}
}

func TestConnectionPersistenceContainsOnlyNonSecretColumns(t *testing.T) {
	path := filepath.Join(t.TempDir(), "orson.db")
	service := NewService(Options{DatabasePath: path})
	if _, err := service.Create("Test workspace"); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	config := ConnectionConfig{WorkspaceID: state.ActiveWorkspaceID, Name: "Local", Brokers: []string{"localhost:9092"}, ClientID: "orson", DialTimeoutSeconds: 5, UpdatedAt: time.Now().UTC()}
	if err := service.SaveConnection(config); err != nil {
		t.Fatal(err)
	}
	if err := service.Close(); err != nil {
		t.Fatal(err)
	}
	reopened := NewService(Options{DatabasePath: path})
	defer reopened.Close()
	got := reopened.Snapshot().Connections[state.ActiveWorkspaceID]
	if got == nil || got.Name != config.Name || len(got.Brokers) != 1 {
		t.Fatalf("connection = %+v", got)
	}
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	rows, err := db.Query(`PRAGMA table_info(workspace_connections)`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var cid, notnull, pk int
		var name, dataType string
		var defaultValue any
		if err := rows.Scan(&cid, &name, &dataType, &notnull, &defaultValue, &pk); err != nil {
			t.Fatal(err)
		}
		lower := strings.ToLower(name)
		if strings.Contains(lower, "secret") || strings.Contains(lower, "password") || strings.Contains(lower, "payload") || strings.Contains(lower, "correlation") || strings.Contains(lower, "private") {
			t.Fatalf("unexpected sensitive column %q", name)
		}
	}
}

func TestFallbackWarningAndConfirmedSnapshotRecovery(t *testing.T) {
	path := filepath.Join(t.TempDir(), "orson.db")
	durable := NewService(Options{DatabasePath: path})
	if _, err := durable.Create("Durable only"); err != nil {
		t.Fatal(err)
	}
	if err := durable.Close(); err != nil {
		t.Fatal(err)
	}

	var fail atomic.Bool
	fail.Store(true)
	service := NewService(Options{
		DatabasePath: path,
		OpenDatabase: func(path string) (*sql.DB, error) {
			if fail.Load() {
				return nil, errors.New("database unavailable")
			}
			return openSQLite(path)
		},
	})
	state := service.Snapshot()
	if state.Persistence.Mode != "session_only" || !strings.Contains(state.Persistence.Warning, "lost when Orson closes") {
		t.Fatalf("fallback persistence = %+v", state.Persistence)
	}
	if _, err := service.Create("Session only"); err != nil {
		t.Fatal(err)
	}
	fail.Store(false)
	if _, err := service.Retry(false); !errors.Is(err, ErrRecoveryConfirmationRequired) {
		t.Fatalf("unconfirmed retry error = %v", err)
	}
	recovered, err := service.Retry(true)
	if err != nil {
		t.Fatal(err)
	}
	if recovered.Persistence.Mode != "persistent" {
		t.Fatalf("recovered persistence = %+v", recovered.Persistence)
	}
	names := make(map[string]bool)
	for _, item := range recovered.Workspaces {
		names[item.Name] = true
	}
	if !names["Durable only"] || !names["Session only"] {
		t.Fatalf("recovered names = %+v", names)
	}
}

func TestNewerMigrationFallsBackWithoutTouchingDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "orson.db")
	db, err := openSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES(99, 'now')`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	service := NewService(Options{DatabasePath: path})
	defer service.Close()
	if service.Snapshot().Persistence.Mode != "session_only" {
		t.Fatalf("newer database did not trigger fallback")
	}
}

func TestRuntimeWriteFailureFallsBackAndRecoveryReplaysDeletionTombstone(t *testing.T) {
	service := testService(t)
	state, err := service.Create("Delete during fallback")
	if err != nil {
		t.Fatal(err)
	}
	deletedID := state.ActiveWorkspaceID
	if err := service.db.Close(); err != nil {
		t.Fatal(err)
	}
	state, err = service.Delete(deletedID)
	if err != nil {
		t.Fatal(err)
	}
	if state.Persistence.Mode != "session_only" || !state.Persistence.SessionDirty {
		t.Fatalf("write failure persistence = %+v", state.Persistence)
	}
	recovered, err := service.Retry(true)
	if err != nil {
		t.Fatal(err)
	}
	if workspaceIndex(recovered, deletedID) >= 0 {
		t.Fatalf("explicitly deleted workspace returned after recovery")
	}
}

func TestRuntimeWriteFailureRecoversDeletionOfFinalWorkspace(t *testing.T) {
	path := filepath.Join(t.TempDir(), "orson.db")
	service := NewService(Options{DatabasePath: path})
	defer service.Close()

	state, err := service.Create("Only workspace")
	if err != nil {
		t.Fatal(err)
	}
	deletedID := state.ActiveWorkspaceID
	if err := service.db.Close(); err != nil {
		t.Fatal(err)
	}

	state, err = service.Delete(deletedID)
	if err != nil {
		t.Fatal(err)
	}
	if len(state.Workspaces) != 0 || state.ActiveWorkspaceID != "" {
		t.Fatalf("fallback delete state = %+v", state)
	}

	recovered, err := service.Retry(true)
	if err != nil {
		t.Fatal(err)
	}
	if len(recovered.Workspaces) != 0 || recovered.ActiveWorkspaceID != "" {
		t.Fatalf("recovered final delete state = %+v", recovered)
	}
}

func TestRecoveryAppliesTombstoneWhenDurableStateHasOneWorkspace(t *testing.T) {
	path := filepath.Join(t.TempDir(), "orson.db")
	durable := NewService(Options{DatabasePath: path})
	if _, err := durable.Create("Durable workspace"); err != nil {
		t.Fatal(err)
	}
	durableID := durable.Snapshot().ActiveWorkspaceID
	if err := durable.Close(); err != nil {
		t.Fatal(err)
	}

	nextIDs := []string{durableID, "session-workspace-id"}
	service := NewService(Options{
		DatabasePath: path,
		NewID: func() string {
			id := nextIDs[0]
			nextIDs = nextIDs[1:]
			return id
		},
		OpenDatabase: func(path string) (*sql.DB, error) {
			return nil, errors.New("database unavailable")
		},
	})
	defer service.Close()
	if _, err := service.Create("Durable workspace"); err != nil {
		t.Fatal(err)
	}
	state, err := service.Create("Session workspace")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Delete(durableID); err != nil {
		t.Fatal(err)
	}

	service.open = openSQLite
	recovered, err := service.Retry(true)
	if err != nil {
		t.Fatal(err)
	}
	if len(recovered.Workspaces) != 1 || recovered.Workspaces[0].Name != "Session workspace" {
		t.Fatalf("recovered workspaces = %+v", recovered.Workspaces)
	}
	if recovered.ActiveWorkspaceID != state.ActiveWorkspaceID {
		t.Fatalf("active workspace = %q, want %q", recovered.ActiveWorkspaceID, state.ActiveWorkspaceID)
	}
}
