import { describe, expect, it } from 'vitest';
import type { ConnectionFormValues } from './types';
import { validateConnectionValues } from './validation';

const makeBroker = (address: string) => ({ id: crypto.randomUUID(), address });

function validValues(overrides: Partial<ConnectionFormValues> = {}): ConnectionFormValues {
  return {
    name: 'Local Kafka',
    brokers: [makeBroker('localhost:9092')],
    clientId: 'orson',
    dialTimeoutSeconds: '5',
    ...overrides,
  };
}

describe('validateConnectionValues', () => {
  it('accepts valid broker forms, including multiple addresses and IPv6', () => {
    expect(
      validateConnectionValues(
        validValues({
          brokers: [
            makeBroker(' localhost:9092 '),
            makeBroker('127.0.0.1:9093'),
            makeBroker('[::1]:9094'),
          ],
        }),
      ),
    ).toEqual({});
  });

  it.each(['', 'localhost', 'localhost:0', 'localhost:65536', '[]:9092', '[not-ipv6]:9092'])(
    'rejects invalid broker address %j',
    (address) => {
      expect(
        validateConnectionValues(validValues({ brokers: [makeBroker(address)] })),
      ).toHaveProperty('brokers.0');
    },
  );

  it('rejects missing required values and non-positive timeouts', () => {
    const errors = validateConnectionValues(
      validValues({ name: ' ', clientId: '\t', dialTimeoutSeconds: '0' }),
    );

    expect(errors).toMatchObject({
      name: 'Connection name is required.',
      clientId: 'Client ID is required.',
      dialTimeoutSeconds: 'Dial timeout must be a positive whole number.',
    });
  });

  it('rejects an empty broker list', () => {
    expect(validateConnectionValues(validValues({ brokers: [] }))).toHaveProperty(
      'brokers.0',
      'Add at least one broker address.',
    );
  });
});
