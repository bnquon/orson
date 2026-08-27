import { describe, expect, it } from 'vitest';
import { initialRunState } from '../runReducer';
import { toObservedRun } from '../observedRun';

const rootRecord = {
  topic: 'order.created',
  key: '',
  value: '{}',
  headers: [],
  partition: 0,
  offset: '1',
  timestamp: '2026-08-27T07:49:39.051Z',
};

describe('toObservedRun', () => {
  it('maps a run while preserving root identity and live metadata', () => {
    const run = toObservedRun(
      {
        ...initialRunState,
        runId: 'run-1',
        rootRecord,
        records: [rootRecord],
      },
      'live',
    );

    expect(run.id).toBe('run-1');
    expect(run.events).toHaveLength(1);
    expect(run.events[0]).toMatchObject({
      id: 'run-1:order.created:0:1',
      kind: 'root',
      metadata: 'Kafka · 2 B · observed live',
    });
  });

  it('allows historical callers to preserve the saved run identity', () => {
    const run = toObservedRun(
      { ...initialRunState, runId: null, rootRecord, records: [rootRecord] },
      'historical',
      'saved-run-1',
    );

    expect(run.id).toBe('saved-run-1');
    expect(run.events[0].id).toBe('saved-run-1:order.created:0:1');
    expect(run.events[0].metadata).toContain('historical');
  });
});
