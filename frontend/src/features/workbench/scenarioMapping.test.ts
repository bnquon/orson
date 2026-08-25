import { describe, expect, it } from 'vitest';
import { api } from '../../../wailsjs/go/models';
import { toLoadedScenario } from './scenarioMapping';

describe('toLoadedScenario', () => {
  it('maps backend scenario data into the existing draft shape', () => {
    const scenario = toLoadedScenario(
      new api.ScenarioData({
        name: 'order-flow',
        sourceFilename: 'scenarios/order-flow.yaml',
        publishTopic: 'order.created',
        publishPayload: '{\n  "orderId": "ord_123"\n}',
        watchedTopics: ['payment.charged', 'inventory.reserved'],
        correlationHeader: 'x-correlation-id',
        captureTimeoutSeconds: 10,
        topology: [
          {
            id: 'edge:order.created->payment.charged',
            from: 'order.created',
            to: 'payment.charged',
          },
        ],
      }),
    );

    expect(scenario.name).toBe('order-flow');
    expect(scenario.draft).toMatchObject({
      rootTopic: 'order.created',
      messageKey: '',
      correlationHeader: 'x-correlation-id',
      captureTimeoutSeconds: '10',
      payload: '{\n  "orderId": "ord_123"\n}',
    });
    expect(scenario.draft.watchedTopics.map((topic) => topic.id)).toEqual(['topic-0', 'topic-1']);
    expect(scenario.draft.headers).toEqual([
      {
        id: 'header-content-type',
        name: 'content-type',
        value: 'application/json',
        protected: false,
      },
    ]);
  });

  it('preserves warning diagnostics and uses the source filename fallback', () => {
    const scenario = toLoadedScenario(
      new api.ScenarioData({
        name: 'warning-flow',
        publishTopic: 'root',
        publishPayload: '{}',
        watchedTopics: ['orphan'],
        correlationHeader: 'x-correlation-id',
        captureTimeoutSeconds: 5,
        topology: [],
        warnings: [{ code: 'disconnected_watched_topic', message: 'orphan is disconnected' }],
      }),
    );

    expect(scenario.sourceFilename).toBe('order-flow.yaml');
    expect(scenario.warnings).toEqual([
      {
        code: 'disconnected_watched_topic',
        message: 'orphan is disconnected',
        sourceFilename: 'order-flow.yaml',
        line: 0,
        column: 0,
      },
    ]);
  });
});
