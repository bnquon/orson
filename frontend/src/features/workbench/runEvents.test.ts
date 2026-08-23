import { describe, expect, it } from 'vitest';
import { parseRunEvent } from './runEvents';

const validRecord = {
  topic: 'order.created',
  key: 'order-1',
  value: '{}',
  headers: [],
  partition: 0,
  offset: '1',
  timestamp: '2026-08-23T00:00:00Z',
};

describe('parseRunEvent', () => {
  it('accepts a valid root event', () => {
    expect(
      parseRunEvent({
        runId: 'run-1',
        sequence: 1,
        kind: 'root_published',
        record: validRecord,
      }),
    ).not.toBeNull();
  });

  it('preserves offsets larger than JavaScript safe integer range', () => {
    const event = parseRunEvent({
      runId: 'run-1',
      sequence: 1,
      kind: 'root_published',
      record: { ...validRecord, offset: '9007199254740993' },
    });

    expect(event?.record?.offset).toBe('9007199254740993');
  });

  it.each([
    { runId: 'run-1', sequence: 0, kind: 'started' },
    { runId: 'run-1', sequence: 1, kind: 'message' },
    { runId: 'run-1', sequence: 1, kind: 'finished', status: 'starting' },
    { runId: 'run-1', sequence: 1, kind: 'finished', status: 'in_progress' },
    { runId: 'run-1', sequence: 1, kind: 'finished' },
    {
      runId: 'run-1',
      sequence: 1,
      kind: 'finished',
      status: 'failed',
      error: { code: 'capture_failed', message: 'bad', retryable: 'yes' },
    },
  ])('ignores malformed event %#', (event) => {
    expect(parseRunEvent(event)).toBeNull();
  });
});
