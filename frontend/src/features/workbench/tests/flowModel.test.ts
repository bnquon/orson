import { describe, expect, it } from 'vitest';
import { preflightErrorCodes } from '../../../api/result';
import {
  buildFlowViewModel,
  flowRootDraftId,
  getRunRecordId,
  nextRecordIdForNode,
} from '../flowModel';
import { initialScenario } from '../fixtures';
import { initialRunState, runReducer } from '../runReducer';
import type { EventRecord, RunState, ScenarioDraft } from '../types';

const draft: ScenarioDraft = {
  ...initialScenario,
  messageKey: 'order-1',
  headers: [],
  payload: '{}',
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

function edgePairs(model: ReturnType<typeof buildFlowViewModel>): string[][] {
  return model.edges.map((edge) => [edge.sourceId, edge.targetId]);
}

function flowDraft(overrides: Partial<ScenarioDraft>): ScenarioDraft {
  const next = { ...draft, ...overrides };
  if (overrides.topology !== undefined && overrides.configuredTopology === undefined) {
    next.configuredTopology = overrides.topology;
  }
  return next;
}

describe('buildFlowViewModel', () => {
  it('keeps the configured diagram while checking and after preflight failure', () => {
    const checking = runReducer(initialRunState, {
      type: 'begin',
      watchedTopics: ['payment.charged'],
    });
    const rejected = runReducer(checking, {
      type: 'failure',
      error: {
        code: preflightErrorCodes.missingTopics,
        message: 'Missing payment.charged',
        retryable: false,
      },
    });
    for (const state of [checking, rejected]) {
      const model = buildFlowViewModel(draft, state);
      expect(model.nodes.every((node) => node.status === 'configured')).toBe(true);
      expect(model.edges.every((edge) => edge.status === 'configured')).toBe(true);
    }
  });
  it('builds the configured order-flow topology with deterministic depth layout', () => {
    const model = buildFlowViewModel(draft, run());

    expect(model.nodes.map((node) => node.id)).toEqual([
      'root:order.created',
      'watched:payment.charged',
      'watched:inventory.reserved',
      'watched:notification.sent',
      'watched:order.cancelled',
    ]);
    expect(edgePairs(model)).toEqual([
      ['root:order.created', 'watched:payment.charged'],
      ['root:order.created', 'watched:order.cancelled'],
      ['watched:payment.charged', 'watched:inventory.reserved'],
      ['watched:payment.charged', 'watched:notification.sent'],
    ]);

    const nodes = new Map(model.nodes.map((node) => [node.topic, node]));
    expect(nodes.get('order.created')?.layout.left).toBe(120);
    expect(nodes.get('payment.charged')?.layout.left).toBe(480);
    expect(nodes.get('order.cancelled')?.layout.left).toBe(480);
    expect(nodes.get('inventory.reserved')?.layout.left).toBe(840);
    expect(nodes.get('notification.sent')?.layout.left).toBe(840);
    expect(nodes.get('payment.charged')?.layout.top).toBeLessThan(
      nodes.get('order.cancelled')?.layout.top ?? 0,
    );
  });

  it('keeps the cancellation branch explicit and separate from payment children', () => {
    const model = buildFlowViewModel(draft, run());

    expect(
      model.edges.find(
        (edge) =>
          edge.sourceId === 'root:order.created' && edge.targetId === 'watched:order.cancelled',
      ),
    ).toMatchObject({
      sourceId: 'root:order.created',
      targetId: 'watched:order.cancelled',
    });
    expect(model.edges.filter((edge) => edge.sourceId === 'root:order.created')).toHaveLength(2);
    expect(model.edges.filter((edge) => edge.sourceId === 'watched:payment.charged')).toHaveLength(
      2,
    );
  });

  it('does not imply edges for disconnected watched topics', () => {
    const model = buildFlowViewModel(
      flowDraft({
        watchedTopics: [
          { id: 'payment', name: 'payment.charged' },
          { id: 'inventory', name: 'inventory.reserved' },
          { id: 'orphan', name: 'orphan.sent' },
        ],
        topology: [{ id: 'order-payment', from: 'order.created', to: 'payment.charged' }],
      }),
      run(),
    );

    expect(edgePairs(model)).toEqual([['root:order.created', 'watched:payment.charged']]);
    expect(model.nodes.find((node) => node.topic === 'payment.charged')?.disconnected).toBe(false);
    expect(model.nodes.find((node) => node.topic === 'inventory.reserved')?.disconnected).toBe(
      true,
    );
    expect(model.nodes.find((node) => node.topic === 'orphan.sent')?.disconnected).toBe(true);
    expect(new Set(model.nodes.map((node) => `${node.layout.left}:${node.layout.top}`)).size).toBe(
      model.nodes.length,
    );
  });

  it('keeps draft identities stable while root and watched topics are renamed', () => {
    const before = buildFlowViewModel(
      flowDraft({
        watchedTopics: [{ id: 'payment-draft-id', name: 'payment.charged' }],
        topology: [{ id: 'route', from: 'order.created', to: 'payment.charged' }],
      }),
      run(),
    );
    const after = buildFlowViewModel(
      flowDraft({
        rootTopic: 'order.updated',
        watchedTopics: [{ id: 'payment-draft-id', name: 'payment.captured' }],
        topology: [{ id: 'route', from: 'order.updated', to: 'payment.captured' }],
      }),
      run(),
    );

    expect(before.nodes.map((node) => node.draftId)).toEqual([flowRootDraftId, 'payment-draft-id']);
    expect(after.nodes.map((node) => node.draftId)).toEqual([flowRootDraftId, 'payment-draft-id']);
    expect(after.nodes.map((node) => node.topic)).toEqual(['order.updated', 'payment.captured']);
  });

  it('derives unique edge IDs from normalized source and target topics', () => {
    const model = buildFlowViewModel(
      flowDraft({
        topology: [
          { id: 'shared-id', from: 'order.created', to: 'payment.charged' },
          { id: 'shared-id', from: 'payment.charged', to: 'inventory.reserved' },
        ],
      }),
      run(),
    );

    expect(model.edges.map((edge) => edge.id)).toEqual([
      'edge:order.created->payment.charged',
      'edge:payment.charged->inventory.reserved',
    ]);
    expect(new Set(model.edges.map((edge) => edge.id)).size).toBe(model.edges.length);
  });

  it('does not render a watched node duplicate when it matches the root topic', () => {
    const model = buildFlowViewModel(
      flowDraft({
        watchedTopics: [
          { id: 'root-copy', name: ' order.created ' },
          { id: 'payment', name: 'payment.charged' },
        ],
        topology: [{ id: 'root-payment', from: 'order.created', to: 'payment.charged' }],
      }),
      run(),
    );

    expect(model.nodes.map((node) => node.id)).toEqual([
      'root:order.created',
      'watched:payment.charged',
    ]);
  });

  it('rejects a multi-node cycle while keeping the configured nodes visible', () => {
    const model = buildFlowViewModel(
      flowDraft({
        watchedTopics: [
          { id: 'a', name: 'a' },
          { id: 'b', name: 'b' },
          { id: 'c', name: 'c' },
        ],
        topology: [
          { id: 'root-a', from: 'order.created', to: 'a' },
          { id: 'a-b', from: 'a', to: 'b' },
          { id: 'b-c', from: 'b', to: 'c' },
          { id: 'c-a', from: 'c', to: 'a' },
        ],
      }),
      run(),
    );

    expect(model.nodes.map((node) => node.topic)).toEqual(['order.created', 'a', 'b', 'c']);
    expect(model.edges).toEqual([]);
    expect(model.routeIssues).toContainEqual(
      expect.objectContaining({
        code: 'topology_cycle',
        edgeId: 'c-a',
        sourceTopic: 'c',
        targetTopic: 'a',
      }),
    );
  });

  it('keeps fan-in and fan-out routes forward and exposes their endpoint topics', () => {
    const model = buildFlowViewModel(
      flowDraft({
        watchedTopics: [
          { id: 'a-id', name: 'a' },
          { id: 'b-id', name: 'b' },
          { id: 'c-id', name: 'c' },
        ],
        topology: [
          { id: 'root-a', from: 'order.created', to: 'a' },
          { id: 'root-b', from: 'order.created', to: 'b' },
          { id: 'a-c', from: 'a', to: 'c' },
          { id: 'b-c', from: 'b', to: 'c' },
        ],
      }),
      run(),
    );
    const nodes = new Map(model.nodes.map((node) => [node.id, node]));

    expect(model.routeIssues).toEqual([]);
    expect(model.edges.map(({ sourceTopic, targetTopic }) => [sourceTopic, targetTopic])).toEqual([
      ['order.created', 'a'],
      ['order.created', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ]);
    for (const edge of model.edges) {
      const source = nodes.get(edge.sourceId);
      const target = nodes.get(edge.targetId);
      expect(source).toBeDefined();
      expect(target).toBeDefined();
      expect(source?.layout.left).toBeLessThan(target?.layout.left ?? 0);
      expect(edge.path).toContain(`M ${(source?.layout.left ?? 0) + (source?.layout.width ?? 0)}`);
      const pathCoordinates = edge.path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      const pathXCoordinates = pathCoordinates.filter((_, index) => index % 2 === 0);
      const sourceRight = (source?.layout.left ?? 0) + (source?.layout.width ?? 0);
      const targetLeft = target?.layout.left ?? 0;
      expect(pathXCoordinates.every((x) => x >= sourceRight && x <= targetLeft)).toBe(true);
      expect(
        edge.path.endsWith(
          ` ${target?.layout.left} ${(target?.layout.top ?? 0) + (target?.layout.height ?? 0) / 2}`,
        ),
      ).toBe(true);
    }
  });

  it('routes skip-level edges through an express lane above intermediate nodes', () => {
    const model = buildFlowViewModel(
      flowDraft({
        watchedTopics: [
          { id: 'a', name: 'a' },
          { id: 'b', name: 'b' },
        ],
        topology: [
          { id: 'root-a', from: 'order.created', to: 'a' },
          { id: 'a-b', from: 'a', to: 'b' },
          { id: 'root-b', from: 'order.created', to: 'b' },
        ],
      }),
      run(),
    );

    const skipLevelEdge = model.edges.find(
      (edge) => edge.sourceId === 'root:order.created' && edge.targetId === 'watched:b',
    );
    expect(skipLevelEdge?.path).toBe('M 310 149 L 310 64 L 840 64 L 840 149');
    expect(model.nodes.every((node) => node.layout.top > 64)).toBe(true);
  });

  it('reports root-target routes without marking their watched source disconnected', () => {
    const model = buildFlowViewModel(
      flowDraft({
        watchedTopics: [{ id: 'payment-id', name: 'payment.charged' }],
        topology: [{ id: 'payment-root', from: 'payment.charged', to: 'order.created' }],
      }),
      run(),
    );

    expect(model.edges).toEqual([]);
    expect(model.nodes.find((node) => node.topic === 'payment.charged')?.disconnected).toBe(false);
    expect(model.routeIssues).toEqual([
      expect.objectContaining({
        code: 'root_target',
        edgeId: 'payment-root',
        sourceTopic: 'payment.charged',
        targetTopic: 'order.created',
      }),
    ]);
  });

  it('ignores empty, unknown, self-referencing, and duplicate topology edges', () => {
    const model = buildFlowViewModel(
      flowDraft({
        topology: [
          { id: 'valid', from: ' order.created ', to: ' payment.charged ' },
          { id: 'duplicate', from: 'order.created', to: 'payment.charged' },
          { id: 'empty-source', from: ' ', to: 'payment.charged' },
          { id: 'empty-target', from: 'order.created', to: '' },
          { id: 'unknown-source', from: 'unknown', to: 'payment.charged' },
          { id: 'unknown-target', from: 'order.created', to: 'unknown' },
          { id: 'self', from: 'payment.charged', to: 'payment.charged' },
          { id: 'root-target', from: 'payment.charged', to: 'order.created' },
        ],
      }),
      run(),
    );

    expect(model.edges).toHaveLength(1);
    expect(model.edges[0]).toMatchObject({
      id: 'edge:order.created->payment.charged',
      sourceId: 'root:order.created',
      targetId: 'watched:payment.charged',
    });
    expect(model.routeIssues.map((issue) => issue.code)).toEqual([
      'duplicate_edge',
      'missing_endpoint',
      'missing_endpoint',
      'unknown_source',
      'unknown_target',
      'self_reference',
      'root_target',
    ]);
    expect(model.routeIssues.every((issue) => issue.message.length > 0)).toBe(true);
  });

  it('handles empty topology and a root with no valid outgoing edges', () => {
    const model = buildFlowViewModel(flowDraft({ topology: [] }), run());

    expect(model.nodes).toHaveLength(5);
    expect(model.edges).toEqual([]);
    expect(model.nodes[0].layout.left).toBe(120);
  });

  it('activates a configured warning edge when its watched topic is added', () => {
    const imported = {
      ...draft,
      watchedTopics: [{ id: 'payment', name: 'payment.charged' }],
      topology: [],
      configuredTopology: [
        { id: 'configured-future', from: 'order.created', to: 'future.completed' },
      ],
    };
    expect(buildFlowViewModel(imported, run()).edges).toEqual([]);

    const edited = {
      ...imported,
      watchedTopics: [...imported.watchedTopics, { id: 'future', name: 'future.completed' }],
    };
    expect(edgePairs(buildFlowViewModel(edited, run()))).toEqual([
      ['root:order.created', 'watched:future.completed'],
    ]);
  });

  it('preserves configured statuses before a run', () => {
    const model = buildFlowViewModel(draft, run());

    expect(model.nodes.every((node) => node.status === 'configured')).toBe(true);
    expect(model.edges.map((edge) => edge.status)).toEqual([
      'configured',
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
      'in_progress',
    ]);
    expect(model.edges.every((edge) => edge.status === 'in_progress')).toBe(true);
    expect(model.nodes[0].recordId).toBe(getRunRecordId('run-1', root));
  });

  it('derives completed and unwitnessed edge statuses from target nodes', () => {
    const root = record('order.created', 10);
    const payment = record('payment.charged', 11);
    const model = buildFlowViewModel(
      draft,
      run({
        runId: 'run-1',
        status: 'completed',
        rootRecord: root,
        records: [root, payment],
        trackedEvents: [
          { topic: 'payment.charged', status: 'completed' },
          { topic: 'inventory.reserved', status: 'unwitnessed' },
          { topic: 'notification.sent', status: 'unwitnessed' },
          { topic: 'order.cancelled', status: 'unwitnessed' },
        ],
      }),
    );

    expect(model.edges.map((edge) => edge.status)).toEqual([
      'completed',
      'unwitnessed',
      'unwitnessed',
      'unwitnessed',
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

  it('marks processing failures on all affected routes', () => {
    const model = buildFlowViewModel(
      draft,
      run({
        runId: 'run-1',
        status: 'failed',
        error: { code: 'processing_failed', message: 'processing failed', retryable: true },
        trackedEvents: draft.watchedTopics.map(({ name }) => ({ topic: name, status: 'failed' })),
      }),
    );

    expect(model.nodes.every((node) => node.status === 'failed')).toBe(true);
    expect(model.edges.every((edge) => edge.status === 'failed')).toBe(true);
  });

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
    expect(model.edges.map((edge) => edge.status)).toEqual([
      'failed',
      'failed',
      'unwitnessed',
      'unwitnessed',
    ]);
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

  it('uses the latest matching record and preserves all record IDs for selection', () => {
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
    expect(nextRecordIdForNode(model.nodes[1], null)).toBe(getRunRecordId('run-1', latest));
    expect(nextRecordIdForNode(model.nodes[1], getRunRecordId('run-1', latest))).toBe(
      getRunRecordId('run-1', first),
    );
    expect(nextRecordIdForNode(model.nodes[1], getRunRecordId('run-1', first))).toBe(
      getRunRecordId('run-1', latest),
    );
  });

  it('terminates forward connector paths at node boundaries', () => {
    const model = buildFlowViewModel(draft, run());
    const nodes = new Map(model.nodes.map((node) => [node.id, node]));

    for (const edge of model.edges) {
      const source = nodes.get(edge.sourceId);
      const target = nodes.get(edge.targetId);
      expect(source).toBeDefined();
      expect(target).toBeDefined();
      if (source === undefined || target === undefined) {
        throw new Error('Flow edge references a missing node');
      }
      expect(source.layout.left).toBeLessThan(target.layout.left);
      expect(edge.path).toMatch(
        new RegExp(
          `^M ${source.layout.left + source.layout.width} ${source.layout.top + source.layout.height / 2}`,
        ),
      );
      expect(
        edge.path.endsWith(
          ` ${target.layout.left} ${target.layout.top + target.layout.height / 2}`,
        ),
      ).toBe(true);
    }
  });

  it('does not attach stale root records after the draft topic changes', () => {
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
    expect(model.edges.map((edge) => edge.id)).toEqual([
      'edge:payment.charged->inventory.reserved',
      'edge:payment.charged->notification.sent',
    ]);
  });

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
    expect(model.edges).toEqual([
      expect.objectContaining({
        sourceId: 'root:order.created',
        targetId: 'watched:payment.charged',
      }),
    ]);
  });
});
