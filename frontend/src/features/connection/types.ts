import type { ApiError } from '../../api/result';

export type ConnectionAttemptStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

export interface ConnectionAttemptState {
  status: ConnectionAttemptStatus;
  error: ApiError | null;
}

export interface ConnectionFormValues {
  name: string;
  brokers: string[];
  clientId: string;
  dialTimeoutSeconds: string;
}
