import type { ApiError } from '../../api/result';

export type ConnectionAttemptStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

export type ConnectionOperation = 'idle' | 'connecting' | 'disconnecting';

export type StartupStatus = 'loading' | 'ready' | 'failed';

export interface ConnectionAttemptState {
  status: ConnectionAttemptStatus;
  error: ApiError | null;
}

interface ConnectionBroker {
  id: string;
  address: string;
}

export interface ConnectionFormValues {
  name: string;
  brokers: ConnectionBroker[];
  clientId: string;
  dialTimeoutSeconds: string;
}

type ConnectionField = 'name' | `brokers.${number}` | 'clientId' | 'dialTimeoutSeconds';

export type ConnectionFieldErrors = Partial<Record<ConnectionField, string>>;
