import { CheckCircle, Clock } from 'iconoir-react';
import type { ObservedEvent, ObservedRun } from '../types';
import { EventInspector } from './EventInspector';
import '../styles/previous-run.css';

interface PreviousRunPanelProps {
  run: ObservedRun;
  selectedEventId: string | null;
  selectedEvent: ObservedEvent | null;
  onSelectEvent: (eventId: string) => void;
}

export function PreviousRunPanel({
  run,
  selectedEventId,
  selectedEvent,
  onSelectEvent,
}: PreviousRunPanelProps) {
  return (
    <aside className="previous-run" aria-label="Previous run">
      <header className="previous-run__header">
        <span className="previous-run__eyebrow">Previous run</span>
        <h2>Chronological sequence</h2>
      </header>
      <div className="previous-run__summary">
        <div>
          <strong>{run.id}</strong>
          <span className="previous-run__metadata">
            <span>{run.events.length} events</span>
            <span aria-hidden="true">·</span>
            <span>{run.duration}</span>
          </span>
        </div>
        <span className="previous-run__complete">
          <CheckCircle width={16} height={16} /> Complete
        </span>
      </div>
      <div className="previous-run__body">
        <div className="previous-run__timeline workbench-scroll-region">
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
                  <span>{event.elapsed}</span>
                </span>
                <span className="timeline-event__name">{event.name}</span>
                <span className="timeline-event__time">
                  <Clock width={16} height={16} /> {event.timestamp}
                </span>
              </span>
            </button>
          ))}
        </div>
        <EventInspector event={selectedEvent} />
      </div>
    </aside>
  );
}
