import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import { startRun as startRunRequest, stopRun as stopRunRequest } from '../../api/run';
import type { ApiError, RunState } from './types';
import { initialRunState, runReducer, type ReducerRunState } from './runReducer';
import { isActiveRunStatus, terminalRunStatuses } from './runStatus';
import { parseRunEvent } from './runEvents';

function bridgeError(details?: string): ApiError {
  return {
    code: 'bridge_error',
    message: 'The app could not communicate with the backend.',
    details,
    retryable: true,
  };
}

export interface RunController {
  state: RunState;
  historyError: ApiError | null;
  startRun(request: Parameters<typeof startRunRequest>[0]): Promise<void>;
  stopRun(): Promise<void>;
  resetRun(): void;
  selectRecord(recordId: string | null): void;
  clearHistoryError(): void;
}

export function useRun(): RunController {
  const [state, dispatch] = useReducer(runReducer, initialRunState);
  const [historyError, setHistoryError] = useState<ApiError | null>(null);
  const mountedRef = useRef(true);
  const requestTokenRef = useRef(0);
  const stateRef = useRef<ReducerRunState>(state);
  const startPendingRef = useRef(false);
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
    if (state.status === 'idle' || terminalRunStatuses.has(state.status)) {
      startPendingRef.current = false;
    }
  }, [state]);

  useEffect(() => {
    mountedRef.current = true;
    let unsubscribe: (() => void) | undefined;
    let unsubscribeHistory: (() => void) | undefined;
    try {
      unsubscribe = EventsOn('run:event', (payload: unknown) => {
        const event = parseRunEvent(payload);
        if (!mountedRef.current) return;
        if (event === null) return;
        dispatch({ type: 'event', event });
      });
      unsubscribeHistory = EventsOn('run:history-error', (payload: unknown) => {
        if (!mountedRef.current || !isApiError(payload)) return;
        setHistoryError(payload);
      });
    } catch (error) {
      dispatch({
        type: 'failure',
        error: bridgeError(error instanceof Error ? error.message : undefined),
      });
    }

    return () => {
      mountedRef.current = false;
      unsubscribe?.();
      unsubscribeHistory?.();
    };
  }, []);

  const startRun = useCallback(async (request: Parameters<typeof startRunRequest>[0]) => {
    if (startPendingRef.current || isActiveRunStatus(stateRef.current.status)) return;

    startPendingRef.current = true;
    const token = ++requestTokenRef.current;
    dispatch({ type: 'begin', watchedTopics: request.watchedTopics });
    const result = await startRunRequest(request);

    if (!mountedRef.current || token !== requestTokenRef.current) {
      if (result.ok) void stopRunRequest(result.data.runId);
      return;
    }
    if (!result.ok) {
      dispatch({ type: 'failure', error: result.error });
      startPendingRef.current = false;
      stopRequestedRef.current = false;
      return;
    }
    dispatch({ type: 'accepted', runId: result.data.runId });
    if (stopRequestedRef.current) {
      stopRequestedRef.current = false;
      void stopRunRequest(result.data.runId);
    }
  }, []);

  const stopRun = useCallback(async () => {
    const runId = stateRef.current.runId;
    if (runId === null) {
      if (startPendingRef.current || stateRef.current.status === 'starting') {
        stopRequestedRef.current = true;
      }
      return;
    }

    const result = await stopRunRequest(runId);
    if (!mountedRef.current || result.ok) return;
    dispatch({ type: 'error', error: result.error });
  }, []);

  const resetRun = useCallback(() => {
    requestTokenRef.current += 1;
    startPendingRef.current = false;
    stopRequestedRef.current = false;
    const runId = stateRef.current.runId;
    if (
      runId !== null &&
      !['idle', 'completed', 'timed_out', 'cancelled', 'failed'].includes(stateRef.current.status)
    ) {
      void stopRunRequest(runId);
    }
    dispatch({ type: 'reset' });
  }, []);

  const selectRecord = useCallback((recordId: string | null) => {
    dispatch({ type: 'select', recordId });
  }, []);

  return {
    state,
    historyError,
    startRun,
    stopRun,
    resetRun,
    selectRecord,
    clearHistoryError: () => setHistoryError(null),
  };
}

function isApiError(value: unknown): value is ApiError {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.retryable === 'boolean'
  );
}
