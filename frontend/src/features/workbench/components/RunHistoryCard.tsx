import type { Ref } from 'react';
import { MoreHoriz } from 'iconoir-react';
import { formatRunDuration } from '../historyFormatting';
import type { HistorySummary } from '../historyTypes';
import { formatStatusLabel } from '../runStatus';

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

export function HistoryCard({
  summary,
  selected,
  menuOpen,
  disabled,
  onSelect,
  onToggleMenu,
  onDelete,
  menuContainerRef,
}: {
  summary: HistorySummary;
  selected: boolean;
  menuOpen: boolean;
  disabled: boolean;
  onSelect: () => void;
  onToggleMenu: () => void;
  onDelete: () => void;
  menuContainerRef?: Ref<HTMLDivElement>;
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
      <div className="history-card__actions" ref={menuContainerRef}>
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
