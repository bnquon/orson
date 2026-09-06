import { useEffect, useRef, useState } from 'react';
import { NavArrowLeft, Refresh, WarningCircle } from 'iconoir-react';
import { LoadingDots } from '../../../components/LoadingDots';
import { Modal, ModalActions, ModalButton } from '../../../components/Modal';
import { Toast } from '../../../components/Toast';
import { toObservedRun } from '../observedRun';
import type { RunContextMode } from '../historyTypes';
import type { ObservedEvent, ObservedRun } from '../types';
import type { RunHistoryController } from '../useRunHistory';
import { EventInspector } from './EventInspector';
import { HistoryCard } from './RunHistoryCard';
import { CurrentRun, RunTimeline, errorStatusClass } from './RunContextViews';
export { formatHistoryRelativeTime } from './RunHistoryCard';
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

export function RunContextPanel({
  currentRun,
  currentSelectedEventId,
  currentSelectedEvent,
  onSelectCurrentEvent,
  history,
  onRetryPreflight,
}: RunContextPanelProps) {
  const [menuRunId, setMenuRunId] = useState<string | null>(null);
  const openMenuContainerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (menuRunId === null) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (openMenuContainerRef.current?.contains(event.target)) return;
      setMenuRunId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuRunId(null);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuRunId]);

  const changeHistoryMode = (mode: RunContextMode) => {
    setMenuRunId(null);
    history.setMode(mode);
  };

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
                onClick={() => changeHistoryMode('history')}
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
            onClick={() => changeHistoryMode('current')}
          >
            Current run
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={history.mode !== 'current'}
            className={history.mode !== 'current' ? 'is-active' : ''}
            onClick={() => changeHistoryMode('history')}
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
                    menuContainerRef={menuRunId === summary.id ? openMenuContainerRef : undefined}
                    disabled={history.operation !== 'idle'}
                    onSelect={() => {
                      setMenuRunId(null);
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
              <button type="button" onClick={() => changeHistoryMode('history')}>
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
