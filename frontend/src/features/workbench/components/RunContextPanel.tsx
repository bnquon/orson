import { useState } from 'react';
import { CheckCircle, Clock, MoreHoriz, NavArrowLeft, Refresh, WarningCircle } from 'iconoir-react';
import { preflightErrorCodes, topicDiagnosticKinds } from '../../../api/result';
import { LoadingDots } from '../../../components/LoadingDots';
import { Modal, ModalActions, ModalButton } from '../../../components/Modal';
import { Toast } from '../../../components/Toast';
import { formatObservedTimestamp } from '../observedEvent';
import { formatRunDuration } from '../historyFormatting';
import { toObservedRun } from '../observedRun';
import type { HistorySummary } from '../historyTypes';
import { formatStatusLabel, isActiveRunStatus } from '../runStatus';
import type { ObservedEvent, ObservedRun, RunStatus } from '../types';
import type { RunHistoryController } from '../useRunHistory';
import { EventInspector } from './EventInspector';
import '../styles/run-context.css';

interface RunContextPanelProps {
  currentRun: ObservedRun;
  currentSelectedEventId: string | null;
  currentSelectedEvent: ObservedEvent | null;
  onSelectCurrentEvent: (eventId: string) => void;
  history: RunHistoryController;
  onRetryPreflight?: () => void;
}

type PendingConfirmation = { kind: 'delete'; id: string; label: string } | { kind: 'clear' } | null;
type HistoryFilterStatus = 'completed' | 'failed' | 'cancelled' | 'timed_out';
type HistoryFilter = 'all' | HistoryFilterStatus;

const historyFilterStatuses: HistoryFilterStatus[] = [
  'completed',
  'failed',
  'cancelled',
  'timed_out',
];

const historyFilterLabels: Record<HistoryFilterStatus, string> = {
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  timed_out: 'Timed out',
};

function activityMessage(status: RunStatus): string {
  switch (status) {
    case 'checking':
      return 'Checking Kafka topics';
    case 'starting':
      return 'Starting capture';
    case 'in_progress':
      return 'Capturing events';
    case 'completed':
      return 'Capture complete';
    case 'timed_out':
      return 'Capture timed out';
    case 'cancelled':
      return 'Capture cancelled';
    case 'failed':
      return 'Capture failed';
    case 'idle':
      return 'Ready to capture';
  }
}

function statusIcon(status: RunStatus) {
  return ['failed', 'timed_out', 'cancelled'].includes(status) ? (
    <WarningCircle width={16} height={16} />
  ) : (
    <CheckCircle width={16} height={16} />
  );
}

function errorStatusClass(status: RunStatus): string {
  if (status === 'timed_out') return ' run-context__error--warning';
  if (status === 'cancelled') return ' run-context__error--cancelled';
  return '';
}

export function formatHistoryRelativeTime(timestamp: string, now = Date.now()): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return 'time unavailable';
  const seconds = Math.round((now - parsed) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2_592_000) return `${Math.floor(seconds / 86_400)}d ago`;
  return new Date(parsed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function HistoryCard({
  summary,
  selected,
  menuOpen,
  disabled,
  onSelect,
  onToggleMenu,
  onDelete,
}: {
  summary: HistorySummary;
  selected: boolean;
  menuOpen: boolean;
  disabled: boolean;
  onSelect: () => void;
  onToggleMenu: () => void;
  onDelete: () => void;
}) {
  return (
    <article className={`history-card ${selected ? 'history-card--selected' : ''}`}>
      <button
        className="history-card__main"
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onSelect}
      >
        <span className="history-card__topline">
          <span className={`history-card__status history-card__status--${summary.status}`}>
            <span className="history-card__status-dot" aria-hidden="true" />
            {formatStatusLabel(summary.status)}
          </span>
          <span className="history-card__time">
            {formatHistoryRelativeTime(summary.finishedAt || summary.startedAt)}
          </span>
        </span>
        <strong className="history-card__scenario">{summary.scenarioName}</strong>
        {summary.scenarioSource === 'unsaved' ? (
          <span className="history-card__source">Unsaved</span>
        ) : null}
        <span className="history-card__topic">{summary.rootTopic || 'Root topic unavailable'}</span>
        <span className="history-card__meta">
          <span>{summary.eventCount} events</span>
          <span aria-hidden="true">·</span>
          <span>{formatRunDuration(summary.durationMs)}</span>
        </span>
        <span className="history-card__outcome">{summary.outcome}</span>
      </button>
      <div className="history-card__actions">
        <button
          className="history-card__menu-button"
          type="button"
          aria-label={`Actions for ${summary.scenarioName}`}
          aria-expanded={menuOpen}
          title="Run actions"
          disabled={disabled}
          onClick={onToggleMenu}
        >
          <MoreHoriz width={16} height={16} />
        </button>
        {menuOpen ? (
          <div className="history-card__menu" role="menu">
            <button type="button" role="menuitem" onClick={onDelete}>
              Delete this run
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function RunTimeline({
  run,
  selectedEventId,
  onSelectEvent,
  emptyCopy,
}: {
  run: ObservedRun;
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  emptyCopy: string;
}) {
  return (
    <div className="run-context__timeline workbench-scroll-region">
      {run.events.length === 0 ? (
        <p className="run-context__empty">{emptyCopy}</p>
      ) : (
        <div className="timeline-events">
          {run.events.map((event) => (
            <button
              className={`timeline-event ${selectedEventId === event.id ? 'timeline-event--selected' : ''}`}
              type="button"
              key={event.id}
              aria-pressed={selectedEventId === event.id}
              onClick={() => onSelectEvent(event.id)}
            >
              <span className="timeline-event__track">
                <span className="timeline-event__dot" />
              </span>
              <span className="timeline-event__body">
                <span className="timeline-event__line">
                  <strong>{event.topic}</strong>
                </span>
                <span className="timeline-event__name">{event.name}</span>
                <span className="timeline-event__time" title={event.timestamp}>
                  <Clock width={16} height={16} /> {formatObservedTimestamp(event.timestamp)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {run.trackedEvents.length > 0 ? (
        <section className="tracked-events" aria-label="Tracked event statuses">
          <span className="tracked-events__label">Tracked topics</span>
          {run.trackedEvents.map((event) => (
            <div className="tracked-event" key={event.topic}>
              <span>{event.topic}</span>
              <span className={`tracked-event__status tracked-event__status--${event.status}`}>
                {formatStatusLabel(event.status)}
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function CurrentRun({
  run,
  selectedEventId,
  selectedEvent,
  onSelectEvent,
  onRetryPreflight,
}: {
  run: ObservedRun;
  selectedEventId: string | null;
  selectedEvent: ObservedEvent | null;
  onSelectEvent: (eventId: string) => void;
  onRetryPreflight?: () => void;
}) {
  const active = isActiveRunStatus(run.status);
  if (run.status === 'checking') {
    return (
      <div className="run-context__state" role="status" aria-busy="true">
        <LoadingDots size="setup" />
        <strong>Checking Kafka topics</strong>
        <span>Verifying the root and watched topics before capture and publishing.</span>
      </div>
    );
  }
  const error = run.error;
  if (
    error?.code === preflightErrorCodes.missingTopics ||
    error?.code === preflightErrorCodes.metadataUnavailable
  ) {
    return (
      <div className="run-context__state run-context__state--error" role="alert">
        <WarningCircle width={18} height={18} />
        <strong>{error.message}</strong>
        {error.topicDiagnostics?.some((item) => item.kind === topicDiagnosticKinds.missingTopic) ? (
          <ul>
            {error.topicDiagnostics
              .filter((item) => item.kind === topicDiagnosticKinds.missingTopic)
              .map((item) => (
                <li key={item.topic}>
                  {item.topic}
                  {item.roles?.length ? ` (${item.roles.join(', ')})` : ''}
                </li>
              ))}
          </ul>
        ) : null}
        {error.code === preflightErrorCodes.metadataUnavailable ? (
          <span>
            Kafka metadata could not be checked. Check your connection and permissions, then retry.
          </span>
        ) : null}
        <span>No run started. Update the scenario or connection and publish again.</span>
        {error.retryable && onRetryPreflight ? (
          <button type="button" onClick={onRetryPreflight}>
            Retry topic check
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <>
      <div className="run-context__summary">
        <div>
          <strong>{run.id}</strong>
          <span className="run-context__metadata">
            <span>{run.events.length} observed</span>
            <span aria-hidden="true">·</span>
            <span>{run.trackedEvents.length} tracked</span>
          </span>
        </div>
        <div className={`run-context__status run-context__status--${run.status}`} role="status">
          <span className="run-context__status-indicator" aria-hidden="true">
            {active ? <LoadingDots size="status" /> : statusIcon(run.status)}
          </span>
          <span>{activityMessage(run.status)}</span>
        </div>
      </div>
      {run.error !== null ? (
        <div className={`run-context__error${errorStatusClass(run.status)}`} role="alert">
          <strong>{run.error.message}</strong>
          {run.error.details ? <span>{run.error.details}</span> : null}
        </div>
      ) : null}
      <div className="run-context__body">
        <RunTimeline
          run={run}
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
          emptyCopy="Start a run to see live Kafka records here."
        />
        <EventInspector event={selectedEvent} />
      </div>
    </>
  );
}

export function RunContextPanel({
  currentRun,
  currentSelectedEventId,
  currentSelectedEvent,
  onSelectCurrentEvent,
  history,
  onRetryPreflight,
}: RunContextPanelProps) {
  const [menuRunId, setMenuRunId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConfirmation>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const historicalRun = history.selectedRun;
  const historicalObserved =
    historicalRun === null
      ? null
      : toObservedRun(historicalRun.run, 'historical', historicalRun.summary.id);
  const selectedHistoricalEvent =
    historicalObserved?.events.find((event) => event.id === history.selectedRecordId) ?? null;
  const historyCounts = history.summaries.reduce<Record<HistoryFilterStatus, number>>(
    (counts, summary) => {
      if (historyFilterStatuses.includes(summary.status as HistoryFilterStatus)) {
        counts[summary.status as HistoryFilterStatus] += 1;
      }
      return counts;
    },
    { completed: 0, failed: 0, cancelled: 0, timed_out: 0 },
  );
  const activeHistoryFilter =
    historyFilter !== 'all' && historyCounts[historyFilter] === 0 ? 'all' : historyFilter;
  const visibleSummaries =
    activeHistoryFilter === 'all'
      ? history.summaries
      : history.summaries.filter((summary) => summary.status === activeHistoryFilter);

  const confirmDelete = async () => {
    if (pending === null) return;
    const success =
      pending.kind === 'delete' ? await history.deleteRun(pending.id) : await history.clearAll();
    if (success) setFeedback(pending.kind === 'delete' ? 'Run deleted.' : 'Run history cleared.');
    setPending(null);
  };

  const headerTitle = history.mode === 'history' ? 'Saved runs' : 'Chronological sequence';
  const headerEyebrow = history.mode === 'history' ? 'Run history' : 'Run context';

  return (
    <aside className="run-context" aria-label="Run context">
      <header className="run-context__header">
        <div className="run-context__header-row">
          {history.mode === 'historical' ? (
            <>
              <button
                className="run-context__back"
                type="button"
                onClick={() => history.setMode('history')}
                title="Back to run history"
              >
                <NavArrowLeft width={16} height={16} />
                History
              </button>
              <span className="run-context__historical-badge" aria-label="Viewing a historical run">
                <span>Historical run</span>
                <span className="run-context__historical-badge-detail">Read-only</span>
              </span>
            </>
          ) : (
            <span className="run-context__eyebrow">{headerEyebrow}</span>
          )}
          {history.mode === 'history' ? (
            <button
              className="run-context__icon-button"
              type="button"
              aria-label="Refresh run history"
              title="Refresh history"
              disabled={history.listStatus === 'loading'}
              aria-busy={history.listStatus === 'loading'}
              onClick={() => void history.refresh()}
            >
              <Refresh width={14} height={14} />
            </button>
          ) : null}
        </div>
        <h2>
          {history.mode === 'historical' ? history.selectedSummary?.scenarioName : headerTitle}
        </h2>
        <div
          className="run-context__mode-switch"
          role="tablist"
          aria-label="Run context mode"
          data-active-mode={history.mode === 'current' ? 'current' : 'history'}
        >
          <button
            type="button"
            role="tab"
            aria-selected={history.mode === 'current'}
            className={history.mode === 'current' ? 'is-active' : ''}
            onClick={() => history.setMode('current')}
          >
            Current run
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={history.mode !== 'current'}
            className={history.mode !== 'current' ? 'is-active' : ''}
            onClick={() => history.setMode('history')}
          >
            History
          </button>
        </div>
      </header>

      {history.mode === 'current' ? (
        <CurrentRun
          run={currentRun}
          selectedEventId={currentSelectedEventId}
          selectedEvent={currentSelectedEvent}
          onSelectEvent={onSelectCurrentEvent}
          onRetryPreflight={onRetryPreflight}
        />
      ) : history.mode === 'history' ? (
        <div className="run-context__history-list">
          <div className="run-context__history-scroll workbench-scroll-region">
            <p className="run-context__privacy-note">
              Local history stores captured Kafka payloads and headers in this workspace database.
            </p>
            {history.summaries.length > 0 ? (
              <div className="history-filters" aria-label="Filter saved runs">
                <button
                  className={`history-filter ${activeHistoryFilter === 'all' ? 'is-active' : ''}`}
                  type="button"
                  aria-pressed={activeHistoryFilter === 'all'}
                  onClick={() => setHistoryFilter('all')}
                >
                  <span>All</span>
                  <span className="history-filter__count">{history.summaries.length}</span>
                </button>
                {historyFilterStatuses.map((status) => {
                  const count = historyCounts[status];
                  if (count === 0) return null;
                  return (
                    <button
                      className={`history-filter history-filter--${status} ${activeHistoryFilter === status ? 'is-active' : ''}`}
                      type="button"
                      aria-pressed={activeHistoryFilter === status}
                      key={status}
                      onClick={() => setHistoryFilter(status)}
                    >
                      <span className="history-filter__dot" aria-hidden="true" />
                      <span>{historyFilterLabels[status]}</span>
                      <span className="history-filter__count">{count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {history.listStatus === 'loading' ? (
              <div className="run-context__state" role="status" aria-busy="true">
                <LoadingDots size="setup" />
                <span>Loading saved runs</span>
              </div>
            ) : history.listStatus === 'failed' ? (
              <div className="run-context__state run-context__state--error" role="alert">
                <WarningCircle width={18} height={18} />
                <span>{history.error?.message ?? 'Run history could not be loaded.'}</span>
                <button type="button" onClick={() => void history.refresh()}>
                  Try again
                </button>
              </div>
            ) : history.summaries.length === 0 ? (
              <div className="run-context__state">
                <span className="run-context__state-mark">∅</span>
                <strong>No runs saved yet</strong>
                <span>Publish a scenario run and it will appear here for later inspection.</span>
              </div>
            ) : (
              <div className="history-cards">
                {visibleSummaries.map((summary) => (
                  <HistoryCard
                    key={summary.id}
                    summary={summary}
                    selected={history.selectedSummary?.id === summary.id}
                    menuOpen={menuRunId === summary.id}
                    disabled={history.operation !== 'idle'}
                    onSelect={() => {
                      void history.selectRun(summary);
                    }}
                    onToggleMenu={() => setMenuRunId(menuRunId === summary.id ? null : summary.id)}
                    onDelete={() => {
                      setMenuRunId(null);
                      setPending({ kind: 'delete', id: summary.id, label: summary.scenarioName });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          {history.summaries.length > 0 ? (
            <div className="run-context__history-footer">
              <button
                className="run-context__clear"
                type="button"
                disabled={history.operation !== 'idle'}
                onClick={() => setPending({ kind: 'clear' })}
              >
                Clear all history
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {history.detailStatus === 'loading' ? (
            <div
              className="run-context__state run-context__state--detail"
              role="status"
              aria-busy="true"
            >
              <LoadingDots size="setup" />
              <span>Loading historical run</span>
            </div>
          ) : historicalObserved === null ? (
            <div className="run-context__state run-context__state--detail" role="alert">
              <WarningCircle width={18} height={18} />
              <span>{history.error?.message ?? 'This historical run is no longer available.'}</span>
              <button type="button" onClick={() => history.setMode('history')}>
                Back to history
              </button>
            </div>
          ) : (
            <>
              <div className="run-context__historical-label">
                <span>Read-only run</span>
                <span>{historicalRun?.summary.rootTopic}</span>
              </div>
              {historicalObserved.error !== null ? (
                <div
                  className={`run-context__error${errorStatusClass(historicalObserved.status)}`}
                  role="alert"
                >
                  <strong>{historicalObserved.error.message}</strong>
                  {historicalObserved.error.details ? (
                    <span>{historicalObserved.error.details}</span>
                  ) : null}
                </div>
              ) : null}
              <div className="run-context__body">
                <RunTimeline
                  run={historicalObserved}
                  selectedEventId={history.selectedRecordId}
                  onSelectEvent={history.selectRecord}
                  emptyCopy="This run captured no Kafka records."
                />
                <EventInspector event={selectedHistoricalEvent} />
              </div>
            </>
          )}
        </>
      )}

      <Modal
        open={pending !== null}
        title={pending?.kind === 'clear' ? 'Clear run history?' : 'Delete this run?'}
        description={
          pending?.kind === 'clear'
            ? 'This removes every saved run from the active workspace.'
            : `Remove ${pending?.label ?? 'this saved run'} from local history.`
        }
        onClose={() => setPending(null)}
        footer={
          <ModalActions>
            <ModalButton type="button" onClick={() => setPending(null)}>
              Cancel
            </ModalButton>
            <ModalButton tone="danger" type="button" onClick={() => void confirmDelete()}>
              {history.operation === 'idle' ? 'Delete' : 'Working…'}
            </ModalButton>
          </ModalActions>
        }
      >
        <p className="run-context__confirmation-copy">
          Saved payloads and headers are local data. This action cannot be undone.
        </p>
      </Modal>
      {feedback !== null ? (
        <Toast message={feedback} tone="success" onDismiss={() => setFeedback(null)} />
      ) : null}
    </aside>
  );
}
