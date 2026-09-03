import { WarningCircle } from 'iconoir-react';
import { LoadingDots } from '../../../components/LoadingDots';
import type { HistoricalRun, HistoryLoadStatus } from '../historyTypes';
import { buildFlowViewModel } from '../flowModel';
import { formatRunDuration } from '../historyFormatting';
import { FlowPanel } from './FlowPanel';
import '../styles/historical-run.css';

interface HistoricalRunPanelProps {
  run: HistoricalRun | null;
  detailStatus: HistoryLoadStatus;
  errorMessage: string | null;
  selectedRecordId: string | null;
  onSelectRecord: (recordId: string) => void;
  onBackToHistory: () => void;
}

function HistoricalRunState({
  detailStatus,
  errorMessage,
  onBackToHistory,
}: Pick<HistoricalRunPanelProps, 'detailStatus' | 'errorMessage' | 'onBackToHistory'>) {
  const loading = detailStatus === 'loading';
  return (
    <div
      className="historical-run__state"
      role={loading ? 'status' : 'alert'}
      aria-busy={loading || undefined}
    >
      {loading ? <LoadingDots size="setup" /> : <WarningCircle width={20} height={20} />}
      <strong>{loading ? 'Loading historical run' : 'Historical run unavailable'}</strong>
      <span>{loading ? 'Retrieving the recorded scenario and events.' : errorMessage}</span>
      {!loading ? (
        <button type="button" onClick={onBackToHistory}>
          Back to history
        </button>
      ) : null}
    </div>
  );
}

export function HistoricalRunPanel({
  run,
  detailStatus,
  errorMessage,
  selectedRecordId,
  onSelectRecord,
  onBackToHistory,
}: HistoricalRunPanelProps) {
  if (run === null) {
    return (
      <HistoricalRunState
        detailStatus={detailStatus}
        errorMessage={errorMessage ?? 'This saved run is no longer available.'}
        onBackToHistory={onBackToHistory}
      />
    );
  }

  const { summary } = run;
  const flowModel = buildFlowViewModel(run.scenario, run.run);

  return (
    <section className="historical-run" aria-label="Historical run detail">
      <dl className="historical-run__metrics">
        <div>
          <dt>Events captured</dt>
          <dd>{summary.eventCount}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{formatRunDuration(summary.durationMs)}</dd>
        </div>
        <div className="historical-run__outcome">
          <dt>Outcome</dt>
          <dd>{summary.outcome}</dd>
        </div>
      </dl>

      <FlowPanel
        model={flowModel}
        selectedRecordId={selectedRecordId}
        onSelectRecord={onSelectRecord}
        ariaLabel="Historical event flow"
      />
    </section>
  );
}
