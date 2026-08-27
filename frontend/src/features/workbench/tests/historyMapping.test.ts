import { describe, expect, it } from 'vitest';
import type { RunHistoryDetailModel } from '../../../api/runHistory';
import { historyRecordId, toHistoricalRun, toHistorySummary } from '../historyMapping';

const detail: RunHistoryDetailModel = {
  summary: {
    runId: 'run-42',
    scenarioSource: 'local',
    scenarioId: 'checkout.yaml',
    scenarioReference: '/tmp/checkout.yaml',
    scenarioName: 'Checkout flow',
    rootTopic: 'order.created',
    status: 'completed',
    startedAt: '2026-08-26T10:00:00Z',
    finishedAt: '2026-08-26T10:00:02Z',
    durationMs: 2000,
    eventCount: 3,
    outcome: '2 downstream topics observed',
  },
  scenario: {
    version: 1,
    source: 'local',
    reference: '/tmp/checkout.yaml',
    sourceFilename: 'checkout.yaml',
    displayName: 'Checkout flow',
    rootTopic: 'order.created',
    watchedTopics: ['payment.charged', 'inventory.reserved'],
    topology: [
      { id: 'order-payment', from: 'order.created', to: 'payment.charged' },
      { id: 'payment-inventory', from: 'payment.charged', to: 'inventory.reserved' },
    ],
    messageKey: 'order-42',
    headers: [{ key: 'x-flow-id', value: 'run-42' }],
    correlationHeader: 'x-flow-id',
    payload: '{"orderId":"42"}',
    captureTimeoutSeconds: 10,
  },
  records: [
    {
      sequence: 4,
      kind: 'message',
      isRoot: false,
      topic: 'payment.charged',
      key: 'order-42',
      value: '{"paid":true}',
      headers: [{ key: 'x-flow-id', value: 'run-42' }],
      partition: 0,
      offset: '12',
      timestamp: '2026-08-26T10:00:01Z',
    },
    {
      sequence: 3,
      kind: 'root_published',
      isRoot: true,
      topic: 'order.created',
      key: 'order-42',
      value: '{"orderId":"42"}',
      headers: [],
      partition: 0,
      offset: '11',
      timestamp: '2026-08-26T10:00:00Z',
    },
  ],
  trackedTopics: [
    { topic: 'payment.charged', status: 'completed' },
    { topic: 'inventory.reserved', status: 'unwitnessed' },
  ],
};

describe('run history mapping', () => {
  it('maps compact summaries without requiring the detail payload', () => {
    const summary = toHistorySummary(detail.summary);

    expect(summary).toMatchObject({
      id: 'run-42',
      scenarioName: 'Checkout flow',
      scenarioSource: 'local',
      status: 'completed',
      eventCount: 3,
      durationMs: 2000,
    });
  });

  it('reconstructs an immutable scenario and stable ordered run state', () => {
    const historical = toHistoricalRun(detail);

    expect(historical.scenario.rootTopic).toBe('order.created');
    expect(historical.scenario.watchedTopics.map(({ name }) => name)).toEqual([
      'payment.charged',
      'inventory.reserved',
    ]);
    expect(historical.records.map(({ topic }) => topic)).toEqual([
      'order.created',
      'payment.charged',
    ]);
    expect(historical.run.rootRecord?.topic).toBe('order.created');
    expect(historical.run.trackedEvents[1]).toEqual({
      topic: 'inventory.reserved',
      status: 'unwitnessed',
    });
    expect(historyRecordId(historical, historical.records[0])).toBe('run-42:order.created:0:11');
  });

  it('keeps failure metadata available to the historical inspector', () => {
    const historical = toHistoricalRun({
      ...detail,
      summary: {
        ...detail.summary,
        status: 'failed',
        failureStage: 'capture',
        failureMessage: 'capture failed',
      },
      records: [],
    });

    expect(historical.run.error).toMatchObject({
      code: 'capture',
      message: 'capture failed',
    });
  });
});
