import { describe, expect, it } from 'vitest';
import { api } from '../../../../wailsjs/go/models';
import { toLoadedScenario, toScenarioDraftData } from '../scenarioMapping';

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

  it('preserves semantic list order for headers, watched topics, and topology', () => {
    const data = Object.assign(
      new api.ScenarioData({
        id: 'local:opaque-1',
        name: 'ordered-flow',
        sourceFilename: 'ordered.yaml',
        publishTopic: 'root',
        publishPayload: '{}',
        watchedTopics: ['second.topic', 'first.topic'],
        correlationHeader: 'trace-id',
        captureTimeoutSeconds: 8,
        topology: [
          { id: 'second-edge', from: 'root', to: 'second.topic' },
          { id: 'first-edge', from: 'root', to: 'first.topic' },
        ],
        configuredTopology: [
          { id: 'configured-0', from: 'root', to: 'second.topic' },
          { id: 'configured-1', from: 'root', to: 'first.topic' },
          { id: 'configured-2', from: 'root', to: 'root' },
        ],
      }),
      {
        source: 'local',
        sourcePath: '/Users/me/scenarios/ordered.yaml',
        localStatus: 'available',
        messageKey: 'order-42',
        headers: [
          { key: 'z-last', value: '1' },
          { key: 'a-first', value: '2' },
        ],
      },
    );

    const scenario = toLoadedScenario(data);
    const serialized = toScenarioDraftData(scenario.name, scenario.draft);

    expect(scenario.source).toBe('local');
    expect(scenario.sourcePath).toBe('/Users/me/scenarios/ordered.yaml');
    expect(scenario.draft.headers.map((header) => header.name)).toEqual(['z-last', 'a-first']);
    expect(serialized.headers.map((header) => header.key)).toEqual(['z-last', 'a-first']);
    expect(serialized.watchedTopics).toEqual(['second.topic', 'first.topic']);
    expect(scenario.draft.topology.map((edge) => edge.id)).toEqual(['second-edge', 'first-edge']);
    expect(serialized.topology.map((edge) => edge.id)).toEqual([
      'configured-0',
      'configured-1',
      'configured-2',
    ]);
  });

  it('keeps an explicit empty header list empty', () => {
    const data = Object.assign(
      new api.ScenarioData({
        name: 'no-headers',
        publishTopic: 'root',
        publishPayload: '{}',
        watchedTopics: ['watched'],
        correlationHeader: 'trace-id',
        captureTimeoutSeconds: 8,
        topology: [],
      }),
      { headers: [] },
    );

    expect(toLoadedScenario(data).draft.headers).toEqual([]);
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
        path: '',
        message: 'orphan is disconnected',
        sourceFilename: 'order-flow.yaml',
        line: 0,
        column: 0,
      },
    ]);
  });
});
