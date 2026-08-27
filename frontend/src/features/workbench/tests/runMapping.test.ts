import { describe, expect, it } from 'vitest';
import { initialScenario } from '../fixtures';
import { toRunRequest } from '../runMapping';

describe('toRunRequest', () => {
  it('includes the resolved correlation header and normalizes editable names', () => {
    const request = toRunRequest({
      ...initialScenario,
      rootTopic: ' order.created ',
      correlationHeader: 'X-Flow-ID',
      watchedTopics: [{ id: 'watched', name: ' payment.charged ' }],
      headers: [
        { id: 'custom', name: ' content-type ', value: 'application/json', protected: false },
      ],
    });

    expect(request.rootTopic).toBe('order.created');
    expect(request.correlationHeader).toBe('X-Flow-ID');
    expect(request.watchedTopics).toEqual(['payment.charged']);
    expect(request.headers).toEqual([{ key: 'content-type', value: 'application/json' }]);
  });

  it('includes the immutable scenario snapshot when publishing', () => {
    const request = toRunRequest(initialScenario, {
      source: 'local',
      scenarioId: 'checkout.yaml',
      sourcePath: '/tmp/checkout.yaml',
      sourceFilename: 'checkout.yaml',
      displayName: 'Checkout flow',
    });

    expect(request.scenarioSnapshot).toMatchObject({
      version: 1,
      source: 'local',
      scenarioId: 'checkout.yaml',
      rootTopic: 'order.created',
    });
  });
});
