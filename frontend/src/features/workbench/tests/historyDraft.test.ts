import { describe, expect, it } from 'vitest';
import type { RunHistoryScenarioSnapshotModel } from '../../../api/runHistory';
import { toHistoricalScenarioDraft } from '../historyDraft';

const snapshot: RunHistoryScenarioSnapshotModel = {
  version: 1,
  id: 'local:deleted-scenario',
  source: 'local',
  reference: '/tmp/deleted-scenario.yaml',
  sourceFilename: 'deleted-scenario.yaml',
  displayName: 'Recorded checkout flow',
  rootTopic: 'orders.created',
  messageKey: 'order-42',
  payload: '{"orderId":"42"}',
  headers: [
    { key: 'content-type', value: 'application/json' },
    { key: 'x-tenant-id', value: 'tenant-7' },
  ],
  watchedTopics: ['payments.captured', 'inventory.reserved'],
  correlationHeader: 'x-flow-id',
  captureTimeoutSeconds: 27,
  topology: [{ id: 'observed-edge', from: 'orders.created', to: 'payments.captured' }],
  configuredTopology: [
    { id: 'configured-1', from: 'orders.created', to: 'payments.captured' },
    { id: 'configured-2', from: 'payments.captured', to: 'inventory.reserved' },
  ],
};

describe('historical scenario draft mapping', () => {
  it('restores every editable scenario field from the persisted snapshot', () => {
    expect(toHistoricalScenarioDraft(snapshot)).toEqual({
      name: 'Recorded checkout flow',
      rootTopic: 'orders.created',
      watchedTopics: [
        { id: 'topic-0', name: 'payments.captured' },
        { id: 'topic-1', name: 'inventory.reserved' },
      ],
      topology: [{ id: 'observed-edge', from: 'orders.created', to: 'payments.captured' }],
      configuredTopology: [
        { id: 'configured-1', from: 'orders.created', to: 'payments.captured' },
        { id: 'configured-2', from: 'payments.captured', to: 'inventory.reserved' },
      ],
      messageKey: 'order-42',
      headers: [
        {
          id: 'header-0',
          name: 'content-type',
          value: 'application/json',
          protected: false,
        },
        { id: 'header-1', name: 'x-tenant-id', value: 'tenant-7', protected: false },
      ],
      correlationHeader: 'x-flow-id',
      payload: '{"orderId":"42"}',
      captureTimeoutSeconds: '27',
    });
  });

  it('uses the persisted topology as the editable fallback for older snapshots', () => {
    const draft = toHistoricalScenarioDraft({ ...snapshot, configuredTopology: undefined });

    expect(draft.configuredTopology).toEqual(snapshot.topology);
    expect(draft.configuredTopology).not.toBe(snapshot.topology);
  });
});
