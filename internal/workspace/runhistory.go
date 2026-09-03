package workspace

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"orson/internal/runhistory"
)

var (
	ErrRunHistoryNotFound       = errors.New("run history entry not found")
	ErrRunHistoryUnavailable    = errors.New("run history persistence is unavailable")
	ErrRunHistoryStaleWorkspace = errors.New("run history workspace is no longer active")
)

// TODO: [Database] Add interrupted-run recovery.
// SaveRunHistory atomically stores one terminal run for the active workspace.
// The workspace check prevents a delayed run completion from being written to
// a workspace selected after that run started.
func (s *Service) SaveRunHistory(entry runhistory.Entry) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.validateExpectedWorkspaceLocked(entry.WorkspaceID); err != nil {
		return err
	}
	if s.db == nil {
		return ErrRunHistoryUnavailable
	}
	if strings.TrimSpace(entry.RunID) == "" {
		return errors.New("run history ID is required")
	}
	if strings.TrimSpace(entry.Status) == "" {
		return errors.New("run history status is required")
	}
	if entry.Scenario.Version == 0 {
		entry.Scenario.Version = runhistory.CurrentScenarioSnapshotVersion
	}
	if entry.EventCount == 0 {
		entry.EventCount = len(entry.Records)
	}
	if err := entry.Validate(); err != nil {
		return err
	}

	scenarioJSON, err := json.Marshal(entry.Scenario)
	if err != nil {
		return fmt.Errorf("marshal run history scenario: %w", err)
	}
	trackedJSON, err := json.Marshal(entry.TrackedTopics)
	if err != nil {
		return fmt.Errorf("marshal run history topic statuses: %w", err)
	}

	tx, err := s.db.BeginTx(context.Background(), nil)
	if err != nil {
		return fmt.Errorf("begin run history transaction: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		INSERT INTO run_history (
			id, workspace_id, scenario_source, scenario_reference,
			scenario_display_name, scenario_snapshot_json, root_topic, status,
			started_at, finished_at, duration_ns, event_count, failure_stage,
			failure_message, connection_name, tracked_topics_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			workspace_id = excluded.workspace_id,
			scenario_source = excluded.scenario_source,
			scenario_reference = excluded.scenario_reference,
			scenario_display_name = excluded.scenario_display_name,
			scenario_snapshot_json = excluded.scenario_snapshot_json,
			root_topic = excluded.root_topic,
			status = excluded.status,
			started_at = excluded.started_at,
			finished_at = excluded.finished_at,
			duration_ns = excluded.duration_ns,
			event_count = excluded.event_count,
			failure_stage = excluded.failure_stage,
			failure_message = excluded.failure_message,
			connection_name = excluded.connection_name,
			tracked_topics_json = excluded.tracked_topics_json
	`, entry.RunID, entry.WorkspaceID, entry.Scenario.Source, entry.Scenario.Reference,
		entry.Scenario.DisplayName, string(scenarioJSON), entry.RootTopic, entry.Status,
		formatTime(entry.StartedAt), formatTime(entry.FinishedAt), entry.Duration.Nanoseconds(),
		entry.EventCount, nullableString(entry.FailureStage), nullableString(entry.FailureMessage),
		entry.ConnectionName, string(trackedJSON)); err != nil {
		return fmt.Errorf("save run history summary: %w", err)
	}

	if _, err := tx.Exec(`DELETE FROM run_history_records WHERE run_id = ?`, entry.RunID); err != nil {
		return fmt.Errorf("replace run history records: %w", err)
	}
	for _, record := range entry.Records {
		headersJSON, err := json.Marshal(record.Headers)
		if err != nil {
			return fmt.Errorf("marshal run history record headers: %w", err)
		}
		if _, err := tx.Exec(`
			INSERT INTO run_history_records (
				run_id, sequence, kind, is_root, topic, message_key, payload,
				headers_json, partition, offset, record_timestamp
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, entry.RunID, record.Sequence, record.Kind, boolInt(record.IsRoot), record.Topic,
			bytesOrEmpty(record.Key), bytesOrEmpty(record.Value), string(headersJSON), record.Partition, record.Offset,
			formatTime(record.Timestamp)); err != nil {
			return fmt.Errorf("save run history record: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit run history: %w", err)
	}
	return nil
}

func (s *Service) ListRunHistory(workspaceID string) ([]runhistory.Summary, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.validateExpectedWorkspaceLocked(workspaceID); err != nil {
		return nil, err
	}
	if s.db == nil {
		return nil, ErrRunHistoryUnavailable
	}
	rows, err := s.db.Query(`
		SELECT id, workspace_id, scenario_source, scenario_reference,
			scenario_display_name, scenario_snapshot_json, root_topic, status,
			started_at, finished_at, duration_ns, event_count, failure_stage,
			failure_message, connection_name, tracked_topics_json
		FROM run_history
		WHERE workspace_id = ?
		ORDER BY finished_at DESC, id ASC
	`, s.state.ActiveWorkspaceID)
	if err != nil {
		return nil, fmt.Errorf("list run history: %w", err)
	}
	defer rows.Close()

	items := make([]runhistory.Summary, 0)
	for rows.Next() {
		item, err := scanSummary(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read run history: %w", err)
	}
	return items, nil
}

func (s *Service) GetRunHistory(id, workspaceID string) (runhistory.Entry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.validateExpectedWorkspaceLocked(workspaceID); err != nil {
		return runhistory.Entry{}, err
	}
	if s.db == nil {
		return runhistory.Entry{}, ErrRunHistoryUnavailable
	}

	row := s.db.QueryRow(`
		SELECT id, workspace_id, scenario_source, scenario_reference,
			scenario_display_name, scenario_snapshot_json, root_topic, status,
			started_at, finished_at, duration_ns, event_count, failure_stage,
			failure_message, connection_name, tracked_topics_json
		FROM run_history WHERE id = ? AND workspace_id = ?
	`, strings.TrimSpace(id), s.state.ActiveWorkspaceID)
	item, trackedJSON, err := scanSummaryWithTracked(row)
	if errors.Is(err, sql.ErrNoRows) {
		return runhistory.Entry{}, ErrRunHistoryNotFound
	}
	if err != nil {
		return runhistory.Entry{}, fmt.Errorf("load run history: %w", err)
	}

	if err := json.Unmarshal([]byte(trackedJSON), &item.TrackedTopics); err != nil {
		return runhistory.Entry{}, fmt.Errorf("decode run history topic statuses: %w", err)
	}
	rows, err := s.db.Query(`
		SELECT sequence, kind, is_root, topic, message_key, payload,
			headers_json, partition, offset, record_timestamp
		FROM run_history_records WHERE run_id = ? ORDER BY sequence ASC
	`, item.RunID)
	if err != nil {
		return runhistory.Entry{}, fmt.Errorf("load run history records: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		record, err := scanRecord(rows)
		if err != nil {
			return runhistory.Entry{}, err
		}
		item.Records = append(item.Records, record)
	}
	if err := rows.Err(); err != nil {
		return runhistory.Entry{}, fmt.Errorf("read run history records: %w", err)
	}
	return item, nil
}

func (s *Service) DeleteRunHistory(id, workspaceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.validateExpectedWorkspaceLocked(workspaceID); err != nil {
		return err
	}
	if s.db == nil {
		return ErrRunHistoryUnavailable
	}
	result, err := s.db.Exec(`DELETE FROM run_history WHERE id = ? AND workspace_id = ?`, strings.TrimSpace(id), s.state.ActiveWorkspaceID)
	if err != nil {
		return fmt.Errorf("delete run history: %w", err)
	}
	count, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("check deleted run history: %w", err)
	}
	if count == 0 {
		return ErrRunHistoryNotFound
	}
	return nil
}

func (s *Service) ClearRunHistory(workspaceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.validateExpectedWorkspaceLocked(workspaceID); err != nil {
		return err
	}
	if s.db == nil {
		return ErrRunHistoryUnavailable
	}
	if _, err := s.db.Exec(`DELETE FROM run_history WHERE workspace_id = ?`, s.state.ActiveWorkspaceID); err != nil {
		return fmt.Errorf("clear run history: %w", err)
	}
	return nil
}

func (s *Service) validateExpectedWorkspaceLocked(workspaceID string) error {
	if err := s.validateActiveWorkspaceLocked(); err != nil {
		return err
	}
	if strings.TrimSpace(workspaceID) != s.state.ActiveWorkspaceID {
		return ErrRunHistoryStaleWorkspace
	}
	return nil
}

func (s *Service) validateActiveWorkspaceLocked() error {
	if s.state.ActiveWorkspaceID == "" || workspaceIndex(s.state, s.state.ActiveWorkspaceID) < 0 {
		return ErrWorkspaceNotFound
	}
	return nil
}

func formatTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339Nano)
}

func nullableString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func bytesOrEmpty(value []byte) []byte {
	if value == nil {
		return []byte{}
	}
	return append([]byte{}, value...)
}

type scanner interface {
	Scan(dest ...any) error
}

func scanSummary(row scanner) (runhistory.Summary, error) {
	item, _, err := scanSummaryWithTracked(row)
	return item.Summary, err
}

func scanSummaryWithTracked(row scanner) (runhistory.Entry, string, error) {
	var item runhistory.Entry
	var scenarioJSON, started, finished, failureStage, failureMessage, connectionName, trackedJSON sql.NullString
	var durationNS int64
	if err := row.Scan(
		&item.RunID, &item.WorkspaceID, &item.Scenario.Source, &item.Scenario.Reference,
		&item.Scenario.DisplayName, &scenarioJSON, &item.RootTopic, &item.Status,
		&started, &finished, &durationNS, &item.EventCount, &failureStage,
		&failureMessage, &connectionName, &trackedJSON,
	); err != nil {
		return runhistory.Entry{}, "", err
	}
	if err := json.Unmarshal([]byte(scenarioJSON.String), &item.Scenario); err != nil {
		return runhistory.Entry{}, "", fmt.Errorf("decode run history scenario: %w", err)
	}
	var err error
	item.StartedAt, err = parseTime(started.String)
	if err != nil {
		return runhistory.Entry{}, "", err
	}
	item.FinishedAt, err = parseTime(finished.String)
	if err != nil {
		return runhistory.Entry{}, "", err
	}
	item.Duration = time.Duration(durationNS)
	item.FailureStage = failureStage.String
	item.FailureMessage = failureMessage.String
	item.ConnectionName = connectionName.String
	return item, trackedJSON.String, nil
}

func scanRecord(row scanner) (runhistory.Record, error) {
	var record runhistory.Record
	var isRoot int
	var headersJSON, timestamp sql.NullString
	if err := row.Scan(&record.Sequence, &record.Kind, &isRoot, &record.Topic, &record.Key, &record.Value, &headersJSON, &record.Partition, &record.Offset, &timestamp); err != nil {
		return runhistory.Record{}, err
	}
	record.IsRoot = isRoot != 0
	if err := json.Unmarshal([]byte(headersJSON.String), &record.Headers); err != nil {
		return runhistory.Record{}, fmt.Errorf("decode run history record headers: %w", err)
	}
	var err error
	record.Timestamp, err = parseTime(timestamp.String)
	if err != nil {
		return runhistory.Record{}, err
	}
	return record, nil
}

func parseTime(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, nil
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse run history timestamp: %w", err)
	}
	return parsed, nil
}
