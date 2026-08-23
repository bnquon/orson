import { describe, expect, it } from 'vitest';
import { buildFlowViewModel, getRunRecordId } from './flowModel';
import { initialRunState } from './runReducer';
import type { EventRecord, RunState, ScenarioDraft } from './types';

const draft: ScenarioDraft = {
  rootTopic: 'order.created',
  watchedTopics: [
    { id: 'payment', name: 'payment.charged' },
    { id: 'inventory', name: 'inventory.reserved' },
    { id: 'notification', name: 'notification.sent' },
  ],
  messageKey: 'order-1',
  headers: [],
  payload: '{}',
  captureTimeoutSeconds: '10',
};

function record(topic: string, offset: number): EventRecord {
  return {
    topic,
    key: 'order-1',
    value: '{}',
    headers: [],
    partition: 0,
    offset: String(offset),
    timestamp: '2026-08-22T00:00:00Z',
  };
}

function run(overrides: Partial<RunState> = {}): RunState {
  return { ...initialRunState, ...overrides };
}

describe('buildFlowViewModel', () => {
  it('shows the configured graph before a run', () => {
    const model = buildFlowViewModel(draft, run());

    expect(model.nodes.map((node) => node.status)).toEqual([
      'configured',
      'configured',
      'configured',
      'configured',
    ]);
    expect(model.edges.map((edge) => edge.status)).toEqual([
      'configured',
      'configured',
      'configured',
    ]);
  });

  it('shows active unresolved nodes and completes the root from rootRecord', () => {
    const root = record('order.created', 10);
    const model = buildFlowViewModel(
      draft,
      run({
        runId: 'run-1',
        status: 'in_progress',
        rootRecord: root,
        records: [root],
        trackedEvents: draft.watchedTopics.map(({ name }) => ({
          topic: name,
          status: 'in_progress',
        })),
      }),
    );

    expect(model.nodes.map((node) => node.status)).toEqual([
      'completed',
      'in_progress',
      'in_progress',
      'in_progress',
    ]);
    expect(model.nodes[0].recordId).toBe(getRunRecordId('run-1', root));
  });

  it('uses the latest matching record for a watched node', () => {
    const first = record('payment.charged', 11);
    const latest = record('payment.charged', 12);
    const model = buildFlowViewModel(
      draft,
      run({ runId: 'run-1', status: 'in_progress', records: [first, latest] }),
    );

    expect(model.nodes[1].record?.offset).toBe('12');
    expect(model.nodes[1].recordId).toBe(getRunRecordId('run-1', latest));
    expect(model.nodes[1].recordIds).toEqual([
      getRunRecordId('run-1', first),
      getRunRecordId('run-1', latest),
    ]);
  });

  it.each(['completed', 'timed_out', 'cancelled'] as const)(
    'marks unresolved topics unwitnessed when the run is %s',
    (status) => {
      const model = buildFlowViewModel(
        draft,
        run({
          runId: 'run-1',
          status,
          trackedEvents: draft.watchedTopics.map(({ name }) => ({
            topic: name,
            status: 'unwitnessed',
          })),
        }),
      );

      expect(model.nodes.slice(1).every((node) => node.status === 'unwitnessed')).toBe(true);
      expect(model.nodes[0].status).toBe('unwitnessed');
      expect(model.edges.every((edge) => edge.status === 'unwitnessed')).toBe(true);
    },
  );

  it('keeps publish failures on the root route instead of making downstream nodes failed', () => {
    const model = buildFlowViewModel(
      draft,
      run({
        runId: 'run-1',
        status: 'failed',
        error: { code: 'publish_failed', message: 'publish failed', retryable: true },
        trackedEvents: draft.watchedTopics.map(({ name }) => ({
          topic: name,
          status: 'unwitnessed',
        })),
      }),
    );

    expect(model.nodes[0].status).toBe('failed');
    expect(model.nodes.slice(1).every((node) => node.status === 'unwitnessed')).toBe(true);
    expect(model.edges[0].status).toBe('failed');
  });

  it('keeps the configured graph neutral when a run is rejected before acceptance', () => {
    const model = buildFlowViewModel(
      draft,
      run({
        status: 'failed',
        error: { code: 'run_busy', message: 'run busy', retryable: true },
      }),
    );

    expect(model.nodes.every((node) => node.status === 'configured')).toBe(true);
    expect(model.edges.every((edge) => edge.status === 'configured')).toBe(true);
  });

  it('does not attach an old root record to a changed draft topic', () => {
    const model = buildFlowViewModel(
      { ...draft, rootTopic: 'order.updated' },
      run({
        runId: 'run-1',
        status: 'completed',
        rootRecord: record('order.created', 10),
        records: [record('order.created', 10)],
      }),
    );

    expect(model.nodes[0].topic).toBe('order.updated');
    expect(model.nodes[0].status).toBe('unwitnessed');
    expect(model.nodes[0].record).toBeNull();
  });

  it.each(['capture_failed', 'processing_failed'] as const)(
    'marks unresolved nodes failed for %s',
    (code) => {
      const model = buildFlowViewModel(
        draft,
        run({
          runId: 'run-1',
          status: 'failed',
          error: { code, message: code, retryable: true },
          trackedEvents: draft.watchedTopics.map(({ name }) => ({ topic: name, status: 'failed' })),
        }),
      );

      expect(model.nodes.slice(1).every((node) => node.status === 'failed')).toBe(true);
      expect(model.edges.every((edge) => edge.status === 'failed')).toBe(true);
    },
  );

  it('deduplicates and ignores empty watched topics', () => {
    const model = buildFlowViewModel(
      {
        ...draft,
        watchedTopics: [
          { id: 'a', name: ' ' },
          { id: 'b', name: 'payment.charged' },
          { id: 'c', name: 'payment.charged' },
        ],
      },
      run(),
    );

    expect(model.nodes.map((node) => node.id)).toEqual([
      'root:order.created',
      'watched:payment.charged',
    ]);
  });
});
