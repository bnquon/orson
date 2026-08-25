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
});
