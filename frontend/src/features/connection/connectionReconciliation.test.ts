import { describe, expect, it } from 'vitest';
import { api } from '../../../wailsjs/go/models';
import { isReconciliationConfirmed } from './connectionReconciliation';

const request: api.ConnectionRequest = {
  name: 'Local Kafka',
  brokers: ['localhost:9092'],
  clientId: 'orson',
  dialTimeoutSeconds: 5,
};

const stateWithActive = (active?: api.ConnectionInfo): api.ConnectionState =>
  api.ConnectionState.createFrom({
    active,
    latestAttempt: { status: 'connected' },
  });

describe('connection reconciliation', () => {
  it('confirms connect only when the active connection matches the request', () => {
    expect(
      isReconciliationConfirmed(stateWithActive(api.ConnectionInfo.createFrom(request)), {
        kind: 'connect',
        request,
      }),
    ).toBe(true);
    expect(isReconciliationConfirmed(stateWithActive(), { kind: 'connect', request })).toBe(false);
  });

  it('confirms disconnect only when no active connection remains', () => {
    expect(isReconciliationConfirmed(stateWithActive(), { kind: 'disconnect' })).toBe(true);
    expect(
      isReconciliationConfirmed(stateWithActive(api.ConnectionInfo.createFrom(request)), {
        kind: 'disconnect',
      }),
    ).toBe(false);
  });
});
