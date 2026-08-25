import { describe, expect, it } from 'vitest';
import { initialScenario } from './fixtures';
import { validateScenario, validateScenarioDraft } from './validation';

const connection = {
  name: 'Local Kafka',
  brokers: ['localhost:9092'],
  clientId: 'orson',
  dialTimeoutSeconds: 5,
  status: 'connected' as const,
};

describe('validateScenario headers', () => {
  it('rejects a custom header matching the managed header after trimming and case folding', () => {
    const result = validateScenario(
      {
        ...initialScenario,
        correlationHeader: 'X-Flow-ID',
        headers: [{ id: 'conflict', name: ' x-FLOW-id ', value: 'user-value', protected: false }],
      },
      connection,
    );

    expect(result.headerErrors.conflict).toBe(
      'Orson manages this header automatically. Remove it from Custom headers.',
    );
    expect(result.firstInvalidControlId).toBe('header-name-conflict');
  });

  it('blocks saving when a watched topic activates a configured topology cycle', () => {
    const draft = {
      ...initialScenario,
      rootTopic: 'order.created',
      watchedTopics: [
        { id: 'payment', name: 'payment.charged' },
        { id: 'inventory', name: 'inventory.reserved' },
      ],
      configuredTopology: [
        { id: 'one', from: 'order.created', to: 'payment.charged' },
        { id: 'two', from: 'payment.charged', to: 'inventory.reserved' },
        { id: 'three', from: 'inventory.reserved', to: 'order.created' },
      ],
    };

    const saveValidation = validateScenarioDraft(draft);
    const runValidation = validateScenario(draft, connection);

    expect(saveValidation.fieldErrors.watchedTopics).toContain('topology contains a cycle');
    expect(saveValidation.issueCount).toBeGreaterThan(0);
    expect(runValidation.fieldErrors.watchedTopics).toBeUndefined();
  });
});
