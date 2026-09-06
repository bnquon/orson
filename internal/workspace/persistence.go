package workspace

import (
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

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
