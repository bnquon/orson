import { toObservedEvent, type ObservedEventOrigin } from './observedEvent';
import type { ObservedRun, RunState } from './types';

type ObservedRunSource = Pick<
  RunState,
  'runId' | 'status' | 'rootRecord' | 'records' | 'trackedEvents' | 'error'
>;

export function toObservedRun(
  run: ObservedRunSource,
  origin: ObservedEventOrigin,
  id = run.runId ?? '—',
): ObservedRun {
  return {
    id,
    status: run.status,
    error: run.error,
    trackedEvents: run.trackedEvents,
    events: run.records.map((record) =>
      toObservedEvent(id, record, run.rootRecord === record, origin),
    ),
  };
}
