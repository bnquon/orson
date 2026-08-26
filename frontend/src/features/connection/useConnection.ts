import { useCallback, useEffect, useRef, useState } from 'react';
import type { api } from '../../../wailsjs/go/models';
import { connect, disconnect, getConnectionStatus } from '../../api/connection';
import type { ApiError, Result } from '../../api/result';
import type {
  ConnectionAttemptState,
  ConnectionAttemptStatus,
  ConnectionFormValues,
  ConnectionOperation,
} from './types';
import {
  isReconciliationConfirmed,
  type ConnectionReconciliation,
} from './connectionReconciliation';
import { selectDialogError } from './errorSelection';

const initialAttempt: ConnectionAttemptState = {
  status: 'disconnected',
  error: null,
};

function toAttempt(state: api.ConnectionState): ConnectionAttemptState {
  const statuses: ConnectionAttemptStatus[] = ['disconnected', 'connecting', 'connected', 'failed'];
  const status = statuses.includes(state.latestAttempt.status as ConnectionAttemptStatus)
    ? (state.latestAttempt.status as ConnectionAttemptStatus)
    : 'disconnected';

  return {
    status,
    error: state.latestAttempt.error ?? null,
  };
}

function toRequest(values: ConnectionFormValues): api.ConnectionRequest {
  return {
    name: values.name.trim(),
    brokers: values.brokers.map((broker) => broker.address.trim()),
    clientId: values.clientId.trim(),
    dialTimeoutSeconds: Number(values.dialTimeoutSeconds),
  };
}

function isBridgeError(error: ApiError): boolean {
  return error.code === 'bridge_error';
}

export interface ConnectionController {
  activeConnection: api.ConnectionInfo | null;
  latestAttempt: ConnectionAttemptState;
  dialogError: ApiError | null;
  operation: ConnectionOperation;
  connect(values: ConnectionFormValues): Promise<Result<api.ConnectionState>>;
  disconnect(): Promise<Result<api.ConnectionState>>;
  clearTransientErrors(): void;
}

export function useConnection(initialState: api.ConnectionState | null): ConnectionController {
  const [activeConnection, setActiveConnection] = useState<api.ConnectionInfo | null>(null);
  const [latestAttempt, setLatestAttempt] = useState<ConnectionAttemptState>(initialAttempt);
  const [operation, setOperation] = useState<ConnectionOperation>('idle');
  const [connectionError, setConnectionError] = useState<ApiError | null>(null);
  const [bridgeError, setBridgeError] = useState<ApiError | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const isCurrent = useCallback((requestId: number) => {
    return mountedRef.current && requestIdRef.current === requestId;
  }, []);

  const applyState = useCallback((state: api.ConnectionState) => {
    setActiveConnection(state.active ?? null);
    setLatestAttempt(toAttempt(state));
  }, []);

  const reconcileStatus = useCallback(
    async (requestId: number, expected: ConnectionReconciliation) => {
      const result = await getConnectionStatus();
      if (!isCurrent(requestId)) return result;

      if (!result.ok) {
        if (isBridgeError(result.error)) {
          setBridgeError(result.error);
        } else {
          setConnectionError(result.error);
        }
        return result;
      }

      applyState(result.data);
      if (isReconciliationConfirmed(result.data, expected)) {
        setConnectionError(null);
        setBridgeError(null);
      }
      return result;
    },
    [applyState, isCurrent],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (initialState === null) return;
    void Promise.resolve().then(() => {
      if (!mountedRef.current) return;
      requestIdRef.current += 1;
      applyState(initialState);
    });
  }, [applyState, initialState]);

  const clearTransientErrors = useCallback(() => {
    setConnectionError(null);
    setBridgeError(null);
    setLatestAttempt((current) => {
      if (current.status !== 'failed') return current;

      return {
        status: activeConnection === null ? 'disconnected' : 'connected',
        error: null,
      };
    });
  }, [activeConnection]);

  const connectToKafka = useCallback(
    async (values: ConnectionFormValues) => {
      const requestId = ++requestIdRef.current;
      const request = toRequest(values);
      setOperation('connecting');
      setConnectionError(null);
      setBridgeError(null);
      setLatestAttempt({ status: 'connecting', error: null });

      const result = await connect(request);
      if (!isCurrent(requestId)) return result;

      setOperation('idle');

      if (!result.ok) {
        if (isBridgeError(result.error)) {
          setLatestAttempt({ status: 'failed', error: null });
          setBridgeError(result.error);
          void reconcileStatus(requestId, { kind: 'connect', request });
        } else {
          setLatestAttempt({ status: 'failed', error: result.error });
          setConnectionError(result.error);
        }
        return result;
      }

      applyState(result.data);
      setConnectionError(null);
      setBridgeError(null);
      return result;
    },
    [applyState, isCurrent, reconcileStatus],
  );

  const disconnectFromKafka = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setOperation('disconnecting');
    setConnectionError(null);
    setBridgeError(null);

    const result = await disconnect();
    if (!isCurrent(requestId)) return result;

    setOperation('idle');

    if (!result.ok) {
      if (isBridgeError(result.error)) {
        setBridgeError(result.error);
        void reconcileStatus(requestId, { kind: 'disconnect' });
      } else {
        setConnectionError(result.error);
      }
      return result;
    }

    applyState(result.data);
    setConnectionError(null);
    setBridgeError(null);
    return result;
  }, [applyState, isCurrent, reconcileStatus]);

  const dialogError = selectDialogError(bridgeError, connectionError);

  return {
    activeConnection,
    latestAttempt,
    dialogError,
    operation,
    connect: connectToKafka,
    disconnect: disconnectFromKafka,
    clearTransientErrors,
  };
}
