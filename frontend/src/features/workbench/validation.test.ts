import { describe, expect, it } from 'vitest';
import { initialScenario } from './fixtures';
import { validateScenario } from './validation';

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
});
