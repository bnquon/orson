import type { api } from '../../../wailsjs/go/models';

export type ConnectionReconciliation =
  { kind: 'connect'; request: api.ConnectionRequest } | { kind: 'disconnect' };

export function isReconciliationConfirmed(
  state: api.ConnectionState,
  expected: ConnectionReconciliation,
): boolean {
  if (expected.kind === 'disconnect') return state.active == null;
  if (state.active == null) return false;

  return (
    state.active.name === expected.request.name &&
    state.active.clientId === expected.request.clientId &&
    state.active.dialTimeoutSeconds === expected.request.dialTimeoutSeconds &&
    state.active.brokers.length === expected.request.brokers.length &&
    state.active.brokers.every((broker, index) => broker === expected.request.brokers[index])
  );
}
