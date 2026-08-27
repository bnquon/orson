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
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"
)

const sessionWarning = "Session only—workspace changes will be lost when Orson closes."

var (
	ErrWorkspaceNotFound            = errors.New("workspace not found")
	ErrWorkspaceNameRequired        = errors.New("workspace name is required")
	ErrWorkspaceNameDuplicate       = errors.New("workspace name already exists")
	ErrRecoveryConfirmationRequired = errors.New("persistence recovery confirmation is required")
)

type OpenDatabase func(string) (*sql.DB, error)

type Options struct {
	DatabasePath string
	OpenDatabase OpenDatabase
	Now          func() time.Time
	NewID        func() string
}

type Service struct {
	mu         sync.Mutex
	path       string
	open       OpenDatabase
	now        func() time.Time
	newID      func() string
	db         *sql.DB
	state      State
	deletedIDs map[string]struct{}
}

func DefaultDatabasePath() (string, error) {
	root, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, "Orson", "orson.db"), nil
}

func NewService(options Options) *Service {
	if options.Now == nil {
		options.Now = func() time.Time { return time.Now().UTC() }
	}
	if options.NewID == nil {
		options.NewID = func() string { return uuid.NewString() }
	}
	if options.OpenDatabase == nil {
		options.OpenDatabase = openSQLite
	}
	service := &Service{
		path:       options.DatabasePath,
		open:       options.OpenDatabase,
		now:        options.Now,
		newID:      options.NewID,
		deletedIDs: make(map[string]struct{}),
	}
	service.initialize()
	return service
}

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

func (s *Service) emptyState() State {
	return State{
		Scenarios:   make(map[string][]ScenarioReference),
		Connections: make(map[string]*ConnectionConfig),
		Selections:  make(map[string]*Selection),
	}
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

func (s *Service) Snapshot() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneState(s.state)
}

func (s *Service) Create(name string) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	name, err := validateName(s.state, "", name)
	if err != nil {
		return State{}, err
	}
	next := cloneState(s.state)
	now := s.now()
	id := s.newID()
	next.Workspaces = append(next.Workspaces, Workspace{ID: id, Name: name, CreatedAt: now, UpdatedAt: now, LastOpenedAt: now})
	next.ActiveWorkspaceID = id
	sortWorkspaces(next.Workspaces)
	s.commit(next, "create workspace")
	return cloneState(s.state), nil
}

func (s *Service) Rename(id, name string) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	name, err := validateName(s.state, id, name)
	if err != nil {
		return State{}, err
	}
	next := cloneState(s.state)
	index := workspaceIndex(next, id)
	if index < 0 {
		return State{}, ErrWorkspaceNotFound
	}
	next.Workspaces[index].Name = name
	next.Workspaces[index].UpdatedAt = s.now()
	s.commit(next, "rename workspace")
	return cloneState(s.state), nil
}

func (s *Service) SetActive(id string) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := cloneState(s.state)
	index := workspaceIndex(next, id)
	if index < 0 {
		return State{}, ErrWorkspaceNotFound
	}
	now := s.now()
	next.ActiveWorkspaceID = id
	next.Workspaces[index].LastOpenedAt = now
	next.Workspaces[index].UpdatedAt = now
	sortWorkspaces(next.Workspaces)
	s.commit(next, "switch workspace")
	return cloneState(s.state), nil
}

func (s *Service) Delete(id string) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := cloneState(s.state)
	index := workspaceIndex(next, id)
	if index < 0 {
		return State{}, ErrWorkspaceNotFound
	}
	next.Workspaces = append(next.Workspaces[:index], next.Workspaces[index+1:]...)
	delete(next.Scenarios, id)
	delete(next.Connections, id)
	delete(next.Selections, id)
	if next.ActiveWorkspaceID == id && len(next.Workspaces) > 0 {
		sortWorkspaces(next.Workspaces)
		next.ActiveWorkspaceID = next.Workspaces[0].ID
	} else if len(next.Workspaces) == 0 {
		next.ActiveWorkspaceID = ""
	}
	wasFallback := s.db == nil
	s.commit(next, "delete workspace")
	if wasFallback || s.db == nil {
		s.deletedIDs[id] = struct{}{}
	}
	return cloneState(s.state), nil
}

func (s *Service) UpsertScenario(reference ScenarioReference) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if workspaceIndex(s.state, reference.WorkspaceID) < 0 {
		return ErrWorkspaceNotFound
	}
	next := cloneState(s.state)
	items := next.Scenarios[reference.WorkspaceID]
	updated := false
	for index := range items {
		if items[index].CanonicalPath == reference.CanonicalPath {
			reference.ImportedAt = items[index].ImportedAt
			items[index] = reference
			updated = true
			break
		}
	}
	if !updated {
		items = append(items, reference)
	}
	next.Scenarios[reference.WorkspaceID] = items
	s.commit(next, "save scenario association")
	return nil
}

// RemoveScenario removes one local-file association from a workspace. The
// canonical file itself is intentionally never touched.
func (s *Service) RemoveScenario(workspaceID, canonicalPath string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if workspaceIndex(s.state, workspaceID) < 0 {
		return ErrWorkspaceNotFound
	}

	next := cloneState(s.state)
	items := next.Scenarios[workspaceID]
	filtered := items[:0]
	removed := false
	for _, item := range items {
		if item.CanonicalPath == canonicalPath {
			removed = true
			continue
		}
		filtered = append(filtered, item)
	}
	if removed {
		if len(filtered) == 0 {
			delete(next.Scenarios, workspaceID)
		} else {
			next.Scenarios[workspaceID] = filtered
		}
	}
	selection := next.Selections[workspaceID]
	selectionRemoved := false
	if selection != nil && selection.Source == "local" && selection.Reference == canonicalPath {
		delete(next.Selections, workspaceID)
		selectionRemoved = true
	}
	if !removed && !selectionRemoved {
		return nil
	}
	s.commit(next, "remove scenario association")
	return nil
}

func (s *Service) SaveConnection(config ConnectionConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if workspaceIndex(s.state, config.WorkspaceID) < 0 {
		return ErrWorkspaceNotFound
	}
	next := cloneState(s.state)
	copyConfig := config
	copyConfig.Brokers = append([]string(nil), config.Brokers...)
	next.Connections[config.WorkspaceID] = &copyConfig
	s.commit(next, "save connection settings")
	return nil
}

func (s *Service) SetSelection(selection Selection) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if workspaceIndex(s.state, selection.WorkspaceID) < 0 {
		return ErrWorkspaceNotFound
	}
	next := cloneState(s.state)
	copySelection := selection
	next.Selections[selection.WorkspaceID] = &copySelection
	s.commit(next, "save selected scenario")
	return nil
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

func validateName(state State, currentID, raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", ErrWorkspaceNameRequired
	}
	key := strings.ToLower(name)
	for _, item := range state.Workspaces {
		if item.ID != currentID && strings.ToLower(strings.TrimSpace(item.Name)) == key {
			return "", ErrWorkspaceNameDuplicate
		}
	}
	return name, nil
}

func workspaceIndex(state State, id string) int {
	for index := range state.Workspaces {
		if state.Workspaces[index].ID == strings.TrimSpace(id) {
			return index
		}
	}
	return -1
}

func sortWorkspaces(items []Workspace) {
	sort.SliceStable(items, func(i, j int) bool {
		if !items[i].LastOpenedAt.Equal(items[j].LastOpenedAt) {
			return items[i].LastOpenedAt.After(items[j].LastOpenedAt)
		}
		if !items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].CreatedAt.Before(items[j].CreatedAt)
		}
		return items[i].ID < items[j].ID
	})
}

func cloneState(source State) State {
	clone := source
	clone.Workspaces = append([]Workspace(nil), source.Workspaces...)
	clone.Scenarios = make(map[string][]ScenarioReference, len(source.Scenarios))
	for id, items := range source.Scenarios {
		clone.Scenarios[id] = append([]ScenarioReference(nil), items...)
	}
	clone.Connections = make(map[string]*ConnectionConfig, len(source.Connections))
	for id, config := range source.Connections {
		if config != nil {
			copyConfig := *config
			copyConfig.Brokers = append([]string(nil), config.Brokers...)
			clone.Connections[id] = &copyConfig
		}
	}
	clone.Selections = make(map[string]*Selection, len(source.Selections))
	for id, selection := range source.Selections {
		if selection != nil {
			copySelection := *selection
			clone.Selections[id] = &copySelection
		}
	}
	return clone
}

func mergeRecovered(durable, session State, deleted map[string]struct{}, now time.Time) State {
	merged := cloneState(durable)
	usedNames := make(map[string]struct{}, len(merged.Workspaces))
	for _, item := range merged.Workspaces {
		if _, wasDeleted := deleted[item.ID]; wasDeleted {
			continue
		}
		usedNames[strings.ToLower(strings.TrimSpace(item.Name))] = struct{}{}
	}
	for _, item := range session.Workspaces {
		if _, wasDeleted := deleted[item.ID]; wasDeleted {
			continue
		}
		index := workspaceIndex(merged, item.ID)
		if index >= 0 {
			delete(usedNames, strings.ToLower(strings.TrimSpace(merged.Workspaces[index].Name)))
			item.Name = availableRecoveredName(item.Name, usedNames)
			merged.Workspaces[index] = item
			usedNames[strings.ToLower(strings.TrimSpace(item.Name))] = struct{}{}
		} else {
			item.Name = availableRecoveredName(item.Name, usedNames)
			item.UpdatedAt = now
			merged.Workspaces = append(merged.Workspaces, item)
			usedNames[strings.ToLower(item.Name)] = struct{}{}
		}
		merged.Scenarios[item.ID] = append([]ScenarioReference(nil), session.Scenarios[item.ID]...)
		if connection := session.Connections[item.ID]; connection != nil {
			copyConfig := *connection
			copyConfig.Brokers = append([]string(nil), connection.Brokers...)
			merged.Connections[item.ID] = &copyConfig
		} else {
			delete(merged.Connections, item.ID)
		}
		if selection := session.Selections[item.ID]; selection != nil {
			copySelection := *selection
			merged.Selections[item.ID] = &copySelection
		} else {
			delete(merged.Selections, item.ID)
		}
	}
	for id := range deleted {
		index := workspaceIndex(merged, id)
		if index >= 0 {
			merged.Workspaces = append(merged.Workspaces[:index], merged.Workspaces[index+1:]...)
			delete(merged.Scenarios, id)
			delete(merged.Connections, id)
			delete(merged.Selections, id)
		}
	}
	merged.ActiveWorkspaceID = session.ActiveWorkspaceID
	sortWorkspaces(merged.Workspaces)
	if workspaceIndex(merged, merged.ActiveWorkspaceID) < 0 && len(merged.Workspaces) > 0 {
		merged.ActiveWorkspaceID = merged.Workspaces[0].ID
	}
	return merged
}

func availableRecoveredName(base string, used map[string]struct{}) string {
	if _, exists := used[strings.ToLower(base)]; !exists {
		return base
	}
	candidate := base + " (recovered)"
	for suffix := 2; ; suffix++ {
		if _, exists := used[strings.ToLower(candidate)]; !exists {
			return candidate
		}
		candidate = fmt.Sprintf("%s (recovered %d)", base, suffix)
	}
}

func migrate(db *sql.DB, now time.Time) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		return err
	}
	var latest int
	if err := db.QueryRow(`SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&latest); err != nil {
		return err
	}
	if latest > 2 {
		return fmt.Errorf("workspace database version %d is newer than supported version 2", latest)
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
		return applyMigration(db, 2, now, []string{
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
		})
	}
	return nil
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
	state := State{Scenarios: make(map[string][]ScenarioReference), Connections: make(map[string]*ConnectionConfig), Selections: make(map[string]*Selection)}
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
	rows, err = db.Query(`SELECT workspace_id, canonical_path, display_filename, imported_at, fingerprint, modified_at_ns, size_bytes FROM workspace_scenarios ORDER BY imported_at ASC, canonical_path ASC`)
	if err != nil {
		return State{}, err
	}
	for rows.Next() {
		var ref ScenarioReference
		var imported string
		if err := rows.Scan(&ref.WorkspaceID, &ref.CanonicalPath, &ref.DisplayFilename, &imported, &ref.Fingerprint, &ref.ModifiedAtNS, &ref.SizeBytes); err != nil {
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
	for _, table := range []string{"workspace_preferences", "workspace_connections", "workspace_scenarios", "app_state"} {
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
	for _, items := range state.Scenarios {
		for _, ref := range items {
			if _, err := tx.Exec(`INSERT INTO workspace_scenarios(workspace_id, canonical_path, display_filename, imported_at, fingerprint, modified_at_ns, size_bytes) VALUES(?, ?, ?, ?, ?, ?, ?)`, ref.WorkspaceID, ref.CanonicalPath, ref.DisplayFilename, ref.ImportedAt.Format(time.RFC3339Nano), ref.Fingerprint, ref.ModifiedAtNS, ref.SizeBytes); err != nil {
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
