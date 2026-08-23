import type { ApiError, EventRecord, RunEvent, RunStatus } from './types';

const runEventKinds = new Set<RunEvent['kind']>([
  'started',
  'ready',
  'root_published',
  'message',
  'finished',
]);

const runEventStatuses = new Set<Exclude<RunStatus, 'idle'>>([
  'starting',
  'in_progress',
  'completed',
  'timed_out',
  'cancelled',
  'failed',
]);

const terminalEventStatuses = new Set<
  Extract<RunStatus, 'completed' | 'timed_out' | 'cancelled' | 'failed'>
>(['completed', 'timed_out', 'cancelled', 'failed']);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEventRecord(value: unknown): value is EventRecord {
  if (!isObject(value)) return false;
  if (
    typeof value.topic !== 'string' ||
    typeof value.key !== 'string' ||
    typeof value.value !== 'string' ||
    typeof value.timestamp !== 'string' ||
    typeof value.partition !== 'number' ||
    typeof value.offset !== 'string' ||
    !/^\d+$/.test(value.offset) ||
    !Number.isSafeInteger(value.partition) ||
    !Array.isArray(value.headers)
  ) {
    return false;
  }

  return value.headers.every(
    (header) =>
      isObject(header) && typeof header.key === 'string' && typeof header.value === 'string',
  );
}

function isApiError(value: unknown): value is ApiError {
  return (
    isObject(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    typeof value.retryable === 'boolean' &&
    (value.details === undefined || typeof value.details === 'string')
  );
}

export function isValidRunEvent(value: unknown): value is RunEvent {
  if (!isObject(value)) return false;

  const kind = value.kind;
  if (
    typeof value.runId !== 'string' ||
    value.runId.trim() === '' ||
    typeof value.sequence !== 'number' ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 1 ||
    typeof kind !== 'string' ||
    !runEventKinds.has(kind as RunEvent['kind'])
  ) {
    return false;
  }

  if (
    (value.status !== undefined &&
      (typeof value.status !== 'string' ||
        !runEventStatuses.has(value.status as Exclude<RunStatus, 'idle'>))) ||
    (value.record !== undefined && !isEventRecord(value.record)) ||
    (value.error !== undefined && !isApiError(value.error))
  ) {
    return false;
  }

  if ((kind === 'root_published' || kind === 'message') && !isEventRecord(value.record)) {
    return false;
  }

  return (
    kind !== 'finished' ||
    terminalEventStatuses.has(
      value.status as Extract<RunStatus, 'completed' | 'timed_out' | 'cancelled' | 'failed'>,
    )
  );
}

export function parseRunEvent(value: unknown): RunEvent | null {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source) as unknown;
    } catch {
      return null;
    }
  }

  return isValidRunEvent(source) ? source : null;
}
