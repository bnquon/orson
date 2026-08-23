import { CheckCircle, Clock, WarningCircle } from 'iconoir-react';
import { LoadingDots } from '../../../components/LoadingDots';
import type { ObservedEvent, ObservedRun } from '../types';
import { formatStatusLabel, isActiveRunStatus } from '../runStatus';
import { EventInspector } from './EventInspector';
import '../styles/previous-run.css';

interface PreviousRunPanelProps {
  run: ObservedRun;
  selectedEventId: string | null;
  selectedEvent: ObservedEvent | null;
  onSelectEvent: (eventId: string) => void;
}

function activityMessage(status: ObservedRun['status']): string {
  switch (status) {
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

export function PreviousRunPanel({
  run,
  selectedEventId,
  selectedEvent,
  onSelectEvent,
}: PreviousRunPanelProps) {
  const active = isActiveRunStatus(run.status);
  const statusIcon = ['failed', 'timed_out', 'cancelled'].includes(run.status) ? (
    <WarningCircle width={16} height={16} />
  ) : (
    <CheckCircle width={16} height={16} />
  );

  return (
    <aside className="previous-run" aria-label="Live run activity">
      <header className="previous-run__header">
        <span className="previous-run__eyebrow">Live run</span>
        <h2>Chronological sequence</h2>
      </header>
      <div className="previous-run__summary">
        <div>
          <strong>{run.id}</strong>
          <span className="previous-run__metadata">
            <span>{run.events.length} observed</span>
            <span aria-hidden="true">·</span>
            <span>{run.trackedEvents.length} tracked</span>
          </span>
        </div>
        <div
          className={`previous-run__status previous-run__status--${run.status}`}
          role="status"
          aria-live="polite"
        >
          <span className="previous-run__status-indicator" aria-hidden="true">
            {active ? <LoadingDots size="status" /> : statusIcon}
          </span>
          <span>{activityMessage(run.status)}</span>
        </div>
      </div>
      {run.error !== null ? (
        <div className="previous-run__error" role="alert">
          <strong>{run.error.message}</strong>
          {run.error.details ? <span>{run.error.details}</span> : null}
        </div>
      ) : null}
      <div className="previous-run__body">
        <div className="previous-run__timeline workbench-scroll-region">
          {run.events.length === 0 ? (
            <p className="previous-run__empty">Start a run to see live Kafka records here.</p>
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
                    <span className="timeline-event__time">
                      <Clock width={16} height={16} /> {event.timestamp}
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
        <EventInspector event={selectedEvent} />
      </div>
    </aside>
  );
}
