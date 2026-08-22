import { CheckCircle, ExpandLines, ZoomIn, ZoomOut } from 'iconoir-react';
import type { ObservedEvent } from '../types';
import '../styles/flow.css';

interface FlowPanelProps {
  events: ObservedEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}

export function FlowPanel({ events, selectedEventId, onSelectEvent }: FlowPanelProps) {
  return (
    <section className="flow-panel" aria-label="Previous run flow">
      <header className="flow-panel__toolbar">
        <div>
          <strong>Event relationships</strong>
          <span>Configured topic flow from the previous run</span>
        </div>
        <div className="flow-panel__controls">
          {/* TODO: Wire zoom and fit controls when the fixture flow gains viewport state. */}
          <button type="button" aria-label="Zoom out" title="Zoom out">
            <ZoomOut />
          </button>
          <span>100%</span>
          <button type="button" aria-label="Zoom in" title="Zoom in">
            <ZoomIn />
          </button>
          <button type="button" aria-label="Fit flow" title="Fit flow">
            <ExpandLines />
          </button>
        </div>
      </header>
      <div className="flow-panel__viewport workbench-scroll-region">
        <div className="flow-map">
          <span className="flow-map__lane flow-map__lane--root">Root event</span>
          <span className="flow-map__lane flow-map__lane--downstream">Downstream topics</span>
          <i className="flow-map__edge flow-map__edge--root-payment" />
          <i className="flow-map__edge flow-map__edge--payment-inventory" />
          <i className="flow-map__edge flow-map__edge--payment-notification" />
          {events.map((event) => (
            <button
              className={`flow-node flow-node--${event.position} ${selectedEventId === event.id ? 'flow-node--selected' : ''}`}
              type="button"
              key={event.id}
              aria-pressed={selectedEventId === event.id}
              onClick={() => onSelectEvent(event.id)}
            >
              <span className="flow-node__topline">
                <span>{event.kind === 'root' ? 'Published' : 'Observed'}</span>
                <CheckCircle width={16} height={16} />
              </span>
              <strong>{event.topic}</strong>
              <span className="flow-node__time">{event.elapsed}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
