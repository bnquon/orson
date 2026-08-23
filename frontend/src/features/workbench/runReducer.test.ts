import { describe, expect, it } from 'vitest';
import { initialRunState, runReducer } from './runReducer';
import type { EventRecord, RunEvent } from './types';

function record(topic: string, offset: number): EventRecord {
  return {
    topic,
    key: 'order-1',
    value: `{ "topic": "${topic}" }`,
    headers: [{ key: 'x-correlation-id', value: 'run-1' }],
    partition: 0,
    offset: String(offset),
    timestamp: '2026-08-22T00:00:00Z',
  };
}

function event(sequence: number, kind: RunEvent['kind'], extra: Partial<RunEvent> = {}): RunEvent {
  return { runId: 'run-1', sequence, kind, ...extra };
}

describe('runReducer', () => {
  it('builds live records and marks matching topics completed', () => {
    let state = runReducer(initialRunState, {
      type: 'begin',
      watchedTopics: ['payment.charged', 'inventory.reserved'],
    });
    state = runReducer(state, {
      type: 'event',
      event: event(1, 'started', { status: 'starting' }),
    });
    state = runReducer(state, {
      type: 'event',
      event: event(2, 'ready', { status: 'in_progress' }),
    });
    state = runReducer(state, {
      type: 'event',
      event: event(3, 'root_published', {
        status: 'in_progress',
        record: record('order.created', 10),
      }),
    });
    state = runReducer(state, {
      type: 'event',
      event: event(4, 'message', {
        status: 'in_progress',
        record: record('payment.charged', 11),
      }),
    });

    expect(state.records).toHaveLength(2);
    expect(state.rootRecord?.topic).toBe('order.created');
    expect(state.trackedEvents).toEqual([
      { topic: 'payment.charged', status: 'completed' },
      { topic: 'inventory.reserved', status: 'in_progress' },
    ]);
  });

  it('ignores stale, duplicate, out-of-order, and post-terminal events', () => {
    let state = runReducer(initialRunState, { type: 'begin', watchedTopics: ['payment.charged'] });
    state = runReducer(state, {
      type: 'event',
      event: event(1, 'started', { status: 'starting' }),
    });
    const ready = event(2, 'ready', { status: 'in_progress' });
    state = runReducer(state, { type: 'event', event: ready });
    state = runReducer(state, { type: 'event', event: ready });
    state = runReducer(state, {
      type: 'event',
      event: event(4, 'message', { record: record('payment.charged', 11) }),
    });
    state = runReducer(state, {
      type: 'event',
      event: event(3, 'finished', { status: 'timed_out' }),
    });
    state = runReducer(state, {
      type: 'event',
      event: event(3, 'finished', { status: 'timed_out' }),
    });

    expect(state.lastSequence).toBe(3);
    expect(state.status).toBe('timed_out');
    expect(state.records).toHaveLength(0);
  });

  it('makes unresolved topics neutral when the run terminates', () => {
    let state = runReducer(initialRunState, { type: 'begin', watchedTopics: ['payment.charged'] });
    state = runReducer(state, {
      type: 'event',
      event: event(1, 'started', { status: 'starting' }),
    });
    state = runReducer(state, {
      type: 'event',
      event: event(2, 'finished', { status: 'cancelled' }),
    });

    expect(state.status).toBe('cancelled');
    expect(state.trackedEvents).toEqual([{ topic: 'payment.charged', status: 'unwitnessed' }]);
  });

  it.each(['completed', 'timed_out', 'cancelled'] as const)(
    'maps unresolved topics to unwitnessed for a %s run',
    (status) => {
      let state = runReducer(initialRunState, {
        type: 'begin',
        watchedTopics: ['payment.charged'],
      });
      state = runReducer(state, {
        type: 'event',
        event: event(1, 'started', { status: 'starting' }),
      });
      state = runReducer(state, {
        type: 'event',
        event: event(2, 'finished', { status }),
      });

      expect(state.status).toBe(status);
      expect(state.trackedEvents).toEqual([{ topic: 'payment.charged', status: 'unwitnessed' }]);
    },
  );

  it.each(['capture_failed', 'processing_failed'] as const)(
    'maps unresolved topics to failed for %s',
    (code) => {
      let state = runReducer(initialRunState, {
        type: 'begin',
        watchedTopics: ['payment.charged'],
      });
      state = runReducer(state, {
        type: 'event',
        event: event(1, 'started', { status: 'starting' }),
      });
      state = runReducer(state, {
        type: 'event',
        event: event(2, 'finished', {
          status: 'failed',
          error: { code, message: code, retryable: true },
        }),
      });

      expect(state.trackedEvents).toEqual([{ topic: 'payment.charged', status: 'failed' }]);
    },
  );

  it('keeps downstream topics neutral when publishing fails before capture observes them', () => {
    let state = runReducer(initialRunState, {
      type: 'begin',
      watchedTopics: ['payment.charged'],
    });
    state = runReducer(state, {
      type: 'event',
      event: event(1, 'started', { status: 'starting' }),
    });
    state = runReducer(state, {
      type: 'event',
      event: event(2, 'finished', {
        status: 'failed',
        error: { code: 'publish_failed', message: 'publish failed', retryable: true },
      }),
    });

    expect(state.trackedEvents).toEqual([{ topic: 'payment.charged', status: 'unwitnessed' }]);
  });

  it('ignores events from a run reset as stale', () => {
    let state = runReducer(initialRunState, { type: 'begin', watchedTopics: ['payment.charged'] });
    state = runReducer(state, {
      type: 'event',
      event: event(1, 'started', { status: 'starting' }),
    });
    state = runReducer(state, { type: 'reset' });

    state = runReducer(state, {
      type: 'event',
      event: event(2, 'ready', { status: 'in_progress' }),
    });
    expect(state.runId).toBeNull();
    expect(state.status).toBe('idle');
  });

  it('does not advance the sequence for a malformed record event', () => {
    let state = runReducer(initialRunState, { type: 'begin', watchedTopics: ['payment.charged'] });
    state = runReducer(state, {
      type: 'event',
      event: event(1, 'started', { status: 'starting' }),
    });
    state = runReducer(state, { type: 'event', event: event(2, 'message') });

    expect(state.lastSequence).toBe(1);

    state = runReducer(state, {
      type: 'event',
      event: event(2, 'ready', { status: 'in_progress' }),
    });
    expect(state.lastSequence).toBe(2);
    expect(state.status).toBe('in_progress');
  });

  it('blocks an unknown run event that arrives after reset', () => {
    let state = runReducer(initialRunState, { type: 'begin', watchedTopics: ['payment.charged'] });
    state = runReducer(state, { type: 'reset' });
    state = runReducer(state, {
      type: 'event',
      event: event(1, 'started', { status: 'starting' }),
    });

    expect(state.runId).toBeNull();
    expect(state.status).toBe('idle');
    expect(state.lastSequence).toBe(0);
  });
});
