import { getRunRecordId } from './flowModel';
import { isValidRunEvent } from './runEvents';
import { isPreflightError, runFailureStage, terminalRunStatuses } from './runStatus';
import type { ApiError, RunEvent, RunState, RunStatus, TrackedEvent } from './types';

export type RunAction =
  | { type: 'begin'; watchedTopics: string[] }
  | { type: 'accepted'; runId: string }
  | { type: 'event'; event: RunEvent }
  | { type: 'failure'; error: ApiError }
  | { type: 'error'; error: ApiError }
  | { type: 'select'; recordId: string | null }
  | { type: 'reset' };

export interface ReducerRunState extends RunState {
  pendingTopics: string[];
  ignoredRunIds: ReadonlySet<string>;
  ignoreUnknownRunEvents: boolean;
}

export const initialRunState: ReducerRunState = {
  pendingTopics: [],
  runId: null,
  status: 'idle',
  rootRecord: null,
  records: [],
  trackedEvents: [],
  selectedRecordId: null,
  error: null,
  lastSequence: 0,
  ignoredRunIds: new Set(),
  ignoreUnknownRunEvents: false,
};

function trackedEventsFor(topics: string[], status: TrackedEvent['status']): TrackedEvent[] {
  const seen = new Set<string>();
  const trackedEvents: TrackedEvent[] = [];

  for (const rawTopic of topics) {
    const topic = rawTopic.trim();
    if (topic === '' || seen.has(topic)) continue;
    seen.add(topic);
    trackedEvents.push({ topic, status });
  }

  return trackedEvents;
}

function terminalTrackedStatus(
  status: RunStatus,
  error: ApiError | undefined,
): TrackedEvent['status'] {
  if (status === 'failed' && runFailureStage(error) !== 'publish') return 'failed';
  return 'unwitnessed';
}

function updateTracked(
  trackedEvents: TrackedEvent[],
  topic: string,
  status: TrackedEvent['status'],
): TrackedEvent[] {
  return trackedEvents.map((tracked) =>
    tracked.topic === topic ? { ...tracked, status } : tracked,
  );
}

function applyEvent(state: ReducerRunState, event: RunEvent): ReducerRunState {
  if (!isValidRunEvent(event)) return state;
  if (state.ignoredRunIds.has(event.runId)) {
    return state;
  }

  if (state.runId === null && state.ignoreUnknownRunEvents) return state;

  if (state.runId === null) {
    if (event.kind !== 'started' || event.sequence !== 1) {
      return state;
    }
  } else if (state.runId !== event.runId) {
    return state;
  }

  if (event.sequence !== state.lastSequence + 1) {
    return state;
  }
  if (terminalRunStatuses.has(state.status)) {
    return state;
  }

  const next: ReducerRunState = {
    ...state,
    runId: event.runId,
    lastSequence: event.sequence,
  };

  switch (event.kind) {
    case 'started':
      return {
        ...next,
        status: 'starting',
        trackedEvents: trackedEventsFor(state.pendingTopics, 'in_progress'),
      };
    case 'ready':
      return { ...next, status: 'in_progress' };
    case 'root_published': {
      if (event.record === undefined) return next;
      const id = getRunRecordId(event.runId, event.record);
      return {
        ...next,
        status: 'in_progress',
        rootRecord: event.record,
        records: [...state.records, event.record],
        selectedRecordId: state.selectedRecordId ?? id,
      };
    }
    case 'message': {
      if (event.record === undefined) return next;
      const id = getRunRecordId(event.runId, event.record);
      return {
        ...next,
        status: 'in_progress',
        records: [...state.records, event.record],
        trackedEvents: updateTracked(state.trackedEvents, event.record.topic, 'completed'),
        selectedRecordId: state.selectedRecordId ?? id,
      };
    }
    case 'finished': {
      const status = event.status ?? 'failed';
      return {
        ...next,
        status,
        error: event.error ?? null,
        trackedEvents: state.trackedEvents.map((tracked) =>
          tracked.status === 'in_progress'
            ? { ...tracked, status: terminalTrackedStatus(status, event.error) }
            : tracked,
        ),
      };
    }
  }
}

export function runReducer(state: ReducerRunState, action: RunAction): ReducerRunState {
  switch (action.type) {
    case 'begin':
      return {
        ...initialRunState,
        ignoredRunIds: state.ignoredRunIds,
        ignoreUnknownRunEvents: false,
        status: 'checking',
        pendingTopics: action.watchedTopics,
      };
    case 'accepted':
      if (state.runId !== null && state.runId !== action.runId) return state;
      return {
        ...state,
        runId: action.runId,
        ...(state.status === 'checking'
          ? {
              status: 'starting' as const,
              trackedEvents: trackedEventsFor(state.pendingTopics, 'in_progress'),
            }
          : {}),
      };
    case 'event':
      return applyEvent(state, action.event);
    case 'failure':
      if (isPreflightError(action.error) && state.runId === null) {
        return {
          ...state,
          status: 'idle',
          error: action.error,
          trackedEvents: [],
          pendingTopics: [],
          ignoreUnknownRunEvents: true,
        };
      }
      return {
        ...state,
        status: 'failed',
        error: action.error,
        trackedEvents: state.trackedEvents.map((tracked) =>
          tracked.status === 'in_progress'
            ? { ...tracked, status: terminalTrackedStatus('failed', action.error) }
            : tracked,
        ),
      };
    case 'error':
      return { ...state, error: action.error };
    case 'select':
      return { ...state, selectedRecordId: action.recordId };
    case 'reset': {
      const ignoredRunIds = new Set(state.ignoredRunIds);
      if (state.runId !== null) ignoredRunIds.add(state.runId);
      return {
        ...initialRunState,
        ignoredRunIds,
        ignoreUnknownRunEvents: state.runId === null,
      };
    }
  }
}
