import { CheckCircle, Clock, WarningCircle } from 'iconoir-react';
import { preflightErrorCodes, topicDiagnosticKinds } from '../../../api/result';
import { LoadingDots } from '../../../components/LoadingDots';
import { formatObservedTimestamp } from '../observedEvent';
import { formatStatusLabel, isActiveRunStatus, type RunStatus } from '../runStatus';
import type { ObservedEvent, ObservedRun } from '../types';
import { EventInspector } from './EventInspector';

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

export function errorStatusClass(status: RunStatus): string {
  if (status === 'timed_out') return ' run-context__error--warning';
  if (status === 'cancelled') return ' run-context__error--cancelled';
  return '';
}

export function RunTimeline({
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

export function CurrentRun({
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
