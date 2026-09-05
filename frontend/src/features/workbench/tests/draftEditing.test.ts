import { describe, expect, it } from 'vitest';
import {
  addTopologyEdge,
  addWatchedTopic,
  areScenarioDraftsEqual,
  removeTopologyEdge,
  removeTopologyTopic,
  removeWatchedTopic,
  renameWatchedTopic,
  renameTopologyTopic,
  setRootTopic,
  type DraftMutationResult,
} from '../draftEditing';
import { initialScenario } from '../fixtures';
import type { ScenarioDraft, ScenarioTopologyEdge } from '../types';

const topology: ScenarioTopologyEdge[] = [
  { id: 'order-payment', from: 'order.created', to: 'payment.charged' },
  { id: 'order-cancelled', from: 'order.created', to: 'order.cancelled' },
  { id: 'payment-inventory', from: 'payment.charged', to: 'inventory.reserved' },
];

function draft(overrides: Partial<ScenarioDraft> = {}): ScenarioDraft {
  return {
    ...initialScenario,
    watchedTopics: initialScenario.watchedTopics.map((topic) => ({ ...topic })),
    topology: initialScenario.topology.map((edge) => ({ ...edge })),
    configuredTopology: initialScenario.configuredTopology.map((edge) => ({ ...edge })),
    ...overrides,
  };
}

function successful(result: DraftMutationResult): ScenarioDraft {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.draft;
}

function errorCode(result: DraftMutationResult): string {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected the draft mutation to fail.');
  expect(result.error.message).not.toBe('');
  return result.error.code;
}

describe('scenario draft topology editing', () => {
  it('treats a changed name as a draft change', () => {
    expect(areScenarioDraftsEqual(initialScenario, { ...initialScenario, name: 'renamed' })).toBe(
      false,
    );
  });

  it('renames both incoming and outgoing topology endpoints', () => {
    expect(renameTopologyTopic(topology, 'order.created', 'order.updated')).toEqual([
      { id: 'order-payment', from: 'order.updated', to: 'payment.charged' },
      { id: 'order-cancelled', from: 'order.updated', to: 'order.cancelled' },
      { id: 'payment-inventory', from: 'payment.charged', to: 'inventory.reserved' },
    ]);
  });

  it('trims topic names when matching and renaming endpoints', () => {
    expect(renameTopologyTopic(topology, ' order.created ', ' order.submitted ')).toEqual([
      { id: 'order-payment', from: 'order.submitted', to: 'payment.charged' },
      { id: 'order-cancelled', from: 'order.submitted', to: 'order.cancelled' },
      { id: 'payment-inventory', from: 'payment.charged', to: 'inventory.reserved' },
    ]);
  });

  it('renames a watched topic across all of its relationships', () => {
    expect(renameTopologyTopic(topology, 'payment.charged', 'payment.failed')).toEqual([
      { id: 'order-payment', from: 'order.created', to: 'payment.failed' },
      { id: 'order-cancelled', from: 'order.created', to: 'order.cancelled' },
      { id: 'payment-inventory', from: 'payment.failed', to: 'inventory.reserved' },
    ]);
  });

  it('does not change topology when a topic is temporarily empty', () => {
    expect(renameTopologyTopic(topology, 'order.created', '   ')).toEqual(topology);
  });

  it('removes edges connected to a deleted watched topic', () => {
    expect(removeTopologyTopic(topology, 'payment.charged')).toEqual([
      { id: 'order-cancelled', from: 'order.created', to: 'order.cancelled' },
    ]);
  });

  it('does not remove edges for an empty topic name', () => {
    expect(removeTopologyTopic(topology, '   ')).toEqual(topology);
  });
});

describe('scenario draft mutations', () => {
  it('sets a trimmed root and rewrites both topology collections from the prior edit value', () => {
    const original = draft({
      rootTopic: 'orders.next',
      configuredTopology: [
        ...initialScenario.configuredTopology,
        { id: 'warning-edge', from: 'external.topic', to: 'missing.topic' },
      ],
    });

    const next = successful(setRootTopic(original, ' orders.next ', 'order.created'));

    expect(next.rootTopic).toBe('orders.next');
    expect(next.topology.map(({ from, to }) => `${from}->${to}`)).toEqual([
      'orders.next->payment.charged',
      'orders.next->order.cancelled',
      'payment.charged->inventory.reserved',
      'payment.charged->notification.sent',
    ]);
    expect(next.configuredTopology.at(-1)).toEqual({
      id: 'warning-edge',
      from: 'external.topic',
      to: 'missing.topic',
    });
    expect(original.topology[0]?.from).toBe('order.created');
  });

  it('rejects blank and duplicate root topic names', () => {
    const original = draft();

    expect(errorCode(setRootTopic(original, '   '))).toBe('topic_name_required');
    expect(errorCode(setRootTopic(original, ' payment.charged '))).toBe('topic_name_duplicate');
  });

  it('adds a named watched topic with a caller-provided stable ID', () => {
    const original = draft();
    const next = successful(
      addWatchedTopic(original, { id: ' topic-refund-issued ', name: ' refund.issued ' }),
    );

    expect(next.watchedTopics.at(-1)).toEqual({
      id: 'topic-refund-issued',
      name: 'refund.issued',
    });
    expect(original.watchedTopics).toHaveLength(4);
  });

  it('rejects invalid or duplicate watched topic identity and names', () => {
    const original = draft();

    expect(errorCode(addWatchedTopic(original, { id: '  ', name: 'refund.issued' }))).toBe(
      'topic_id_required',
    );
    expect(errorCode(addWatchedTopic(original, { id: 'topic-new', name: ' order.created ' }))).toBe(
      'topic_name_duplicate',
    );
    expect(
      errorCode(
        addWatchedTopic(original, {
          id: 'topic-payment-charged',
          name: 'refund.issued',
        }),
      ),
    ).toBe('topic_id_duplicate');
  });

  it('renames a watched topic by stable ID and rewrites edges from its prior edit value', () => {
    const original = draft({
      watchedTopics: initialScenario.watchedTopics.map((topic) =>
        topic.id === 'topic-payment-charged' ? { ...topic, name: 'payment.settled' } : { ...topic },
      ),
    });
    const next = successful(
      renameWatchedTopic(original, 'topic-payment-charged', ' payment.settled ', 'payment.charged'),
    );

    expect(next.watchedTopics[0]).toEqual({
      id: 'topic-payment-charged',
      name: 'payment.settled',
    });
    expect(next.topology.map(({ from, to }) => `${from}->${to}`)).toEqual([
      'order.created->payment.settled',
      'order.created->order.cancelled',
      'payment.settled->inventory.reserved',
      'payment.settled->notification.sent',
    ]);
    expect(next.configuredTopology).toEqual(next.topology);
  });

  it('rejects missing, blank, and duplicate watched topic renames', () => {
    const original = draft();

    expect(errorCode(renameWatchedTopic(original, 'missing-id', 'refund.issued'))).toBe(
      'watched_topic_not_found',
    );
    expect(errorCode(renameWatchedTopic(original, 'topic-payment-charged', '  '))).toBe(
      'topic_name_required',
    );
    expect(
      errorCode(renameWatchedTopic(original, 'topic-payment-charged', ' inventory.reserved ')),
    ).toBe('topic_name_duplicate');
  });

  it('removes a watched topic and every connected edge without disturbing other edge order', () => {
    const original = draft({
      configuredTopology: [
        ...initialScenario.configuredTopology,
        { id: 'warning-edge', from: 'external.topic', to: 'missing.topic' },
      ],
    });
    const next = successful(removeWatchedTopic(original, 'topic-payment-charged'));

    expect(next.watchedTopics.map((topic) => topic.id)).not.toContain('topic-payment-charged');
    expect(next.topology).toEqual([
      { id: 'edge-order-cancelled', from: 'order.created', to: 'order.cancelled' },
    ]);
    expect(next.configuredTopology).toEqual([
      { id: 'edge-order-cancelled', from: 'order.created', to: 'order.cancelled' },
      { id: 'warning-edge', from: 'external.topic', to: 'missing.topic' },
    ]);
  });

  it('adds an ordered edge to active and configured topology with a deterministic ID', () => {
    const original = draft({
      topology: initialScenario.topology.slice(0, 2),
      configuredTopology: [
        ...initialScenario.configuredTopology.slice(0, 2),
        { id: 'warning-edge', from: 'external.topic', to: 'missing.topic' },
      ],
    });
    const next = successful(
      addTopologyEdge(original, {
        from: ' order.cancelled ',
        to: ' inventory.reserved ',
      }),
    );

    const added = {
      id: 'edge:order.cancelled->inventory.reserved',
      from: 'order.cancelled',
      to: 'inventory.reserved',
    };
    expect(next.topology).toEqual([...original.topology, added]);
    expect(next.configuredTopology).toEqual([...original.configuredTopology, added]);
  });

  it('rejects invalid edge endpoints, self-links, duplicates, and cycles', () => {
    const original = draft();

    expect(
      errorCode(addTopologyEdge(original, { from: 'missing.topic', to: 'payment.charged' })),
    ).toBe('topology_source_invalid');
    expect(
      errorCode(addTopologyEdge(original, { from: 'payment.charged', to: 'order.created' })),
    ).toBe('topology_target_invalid');
    expect(
      errorCode(addTopologyEdge(original, { from: 'payment.charged', to: 'payment.charged' })),
    ).toBe('topology_self_edge');
    expect(
      errorCode(addTopologyEdge(original, { from: 'order.created', to: 'payment.charged' })),
    ).toBe('topology_edge_duplicate');
    expect(
      errorCode(addTopologyEdge(original, { from: 'inventory.reserved', to: 'payment.charged' })),
    ).toBe('topology_cycle');
  });

  it('removes an edge by canonical endpoints while preserving unrelated configured warnings', () => {
    const original = draft({
      configuredTopology: [
        ...initialScenario.configuredTopology,
        { id: 'warning-edge', from: 'external.topic', to: 'missing.topic' },
      ],
    });
    const next = successful(
      removeTopologyEdge(original, {
        from: ' payment.charged ',
        to: ' inventory.reserved ',
      }),
    );

    expect(next.topology.map((edge) => edge.id)).toEqual([
      'edge-order-payment',
      'edge-order-cancelled',
      'edge-payment-notification',
    ]);
    expect(next.configuredTopology.map((edge) => edge.id)).toEqual([
      'edge-order-payment',
      'edge-order-cancelled',
      'edge-payment-notification',
      'warning-edge',
    ]);
    expect(
      errorCode(removeTopologyEdge(original, { from: 'missing.topic', to: 'other.topic' })),
    ).toBe('topology_edge_not_found');
  });
});
