import { NavArrowLeft } from 'iconoir-react';
import type { HistorySummary } from '../historyTypes';
import { formatObservedTimestamp } from '../observedEvent';
import { formatStatusLabel } from '../runStatus';
import '../styles/historical-run.css';

interface HistoricalRunToolbarProps {
  summary: HistorySummary;
  onReturnToCurrent: () => void;
}

export function HistoricalRunToolbar({ summary, onReturnToCurrent }: HistoricalRunToolbarProps) {
  const recordedAt = summary.finishedAt || summary.startedAt;

  return (
    <div className="workspace-toolbar workspace-toolbar--historical">
      <div className="workspace-toolbar__historical-left">
        <button
          className="historical-toolbar__back"
          type="button"
          onClick={onReturnToCurrent}
          title="Return to the current workspace"
        >
          <NavArrowLeft width={16} height={16} />
          <span>Current workspace</span>
        </button>
        <span className="historical-toolbar__divider" aria-hidden="true" />
        <div className="historical-toolbar__identity">
          <span>Historical run</span>
          <strong>{summary.scenarioName}</strong>
          {summary.scenarioSource === 'unsaved' ? (
            <small className="historical-toolbar__source">Unsaved scenario</small>
          ) : null}
        </div>
      </div>
      <div className="workspace-toolbar__historical-right">
        <span
          className={`historical-toolbar__status historical-toolbar__status--${summary.status}`}
        >
          {formatStatusLabel(summary.status)}
        </span>
        <span className="historical-toolbar__timestamp">
          {recordedAt ? formatObservedTimestamp(recordedAt) : 'Time unavailable'}
        </span>
        <span className="historical-toolbar__readonly">Read-only</span>
      </div>
    </div>
  );
}
