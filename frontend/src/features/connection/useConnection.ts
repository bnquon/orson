import { useCallback, useEffect, useRef, useState } from 'react';
import type { api } from '../../../wailsjs/go/models';
import { connect, disconnect, getConnectionStatus } from '../../api/connection';
import type { ApiError, Result } from '../../api/result';
import type {
  ConnectionAttemptState,
  ConnectionAttemptStatus,
  ConnectionFormValues,
  ConnectionOperation,
  StartupStatus,
} from './types';
import { selectDialogError, selectSetupError } from './errorSelection';

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
    brokers: values.brokers.map((broker) => broker.trim()),
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
  startup: {
    status: StartupStatus;
    error: ApiError | null;
  };
  setupError: ApiError | null;
  dialogError: ApiError | null;
  operation: ConnectionOperation;
  connect(values: ConnectionFormValues): Promise<Result<api.ConnectionState>>;
  disconnect(): Promise<Result<api.ConnectionState>>;
  retryStartup(): Promise<void>;
  clearTransientErrors(): void;
}

export function useConnection(): ConnectionController {
  const [activeConnection, setActiveConnection] = useState<api.ConnectionInfo | null>(null);
  const [latestAttempt, setLatestAttempt] = useState<ConnectionAttemptState>(initialAttempt);
  const [startupStatus, setStartupStatus] = useState<StartupStatus>('loading');
  const [startupError, setStartupError] = useState<ApiError | null>(null);
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
    async (requestId: number) => {
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
      setConnectionError(null);
      setBridgeError(null);
      return result;
    },
    [applyState, isCurrent],
  );

  const loadStartupStatus = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setStartupStatus('loading');

    const result = await getConnectionStatus();
    if (!isCurrent(requestId)) return;

    if (!result.ok) {
      setStartupStatus('failed');
      setStartupError(result.error);
      return;
    }

    applyState(result.data);
    setStartupError(null);
    setStartupStatus('ready');
  }, [applyState, isCurrent]);

  useEffect(() => {
    mountedRef.current = true;
    void Promise.resolve().then(() => loadStartupStatus());

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [loadStartupStatus]);

  const clearTransientErrors = useCallback(() => {
    setConnectionError(null);
    setBridgeError(null);
    setStartupError(null);
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
      setOperation('connecting');
      setConnectionError(null);
      setBridgeError(null);
      setStartupError(null);
      setStartupStatus('ready');
      setLatestAttempt({ status: 'connecting', error: null });

      const result = await connect(toRequest(values));
      if (!isCurrent(requestId)) return result;

      setOperation('idle');

      if (!result.ok) {
        if (isBridgeError(result.error)) {
          setLatestAttempt({ status: 'failed', error: null });
          setBridgeError(result.error);
          void reconcileStatus(requestId);
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
        void reconcileStatus(requestId);
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

  const setupError = selectSetupError(startupError, bridgeError, connectionError);
  const dialogError = selectDialogError(bridgeError, connectionError);

  return {
    activeConnection,
    latestAttempt,
    startup: {
      status: startupStatus,
      error: startupError,
    },
    setupError,
    dialogError,
    operation,
    connect: connectToKafka,
    disconnect: disconnectFromKafka,
    retryStartup: loadStartupStatus,
    clearTransientErrors,
  };
}
