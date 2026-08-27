import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  clearRunHistory,
  deleteRunHistory,
  getRunHistory,
  listRunHistory,
} from '../../api/runHistory';
import type { ApiError } from '../../api/result';
import { historyRecordId, toHistoricalRun, toHistorySummary } from './historyMapping';
import type {
  HistoricalRun,
  HistoryLoadStatus,
  HistoryOperation,
  HistorySummary,
  RunContextMode,
} from './historyTypes';

export interface RunHistoryController {
  mode: RunContextMode;
  summaries: HistorySummary[];
  selectedSummary: HistorySummary | null;
  selectedRun: HistoricalRun | null;
  selectedRecordId: string | null;
  listStatus: HistoryLoadStatus;
  detailStatus: HistoryLoadStatus;
  operation: HistoryOperation;
  error: ApiError | null;
  setMode: (mode: RunContextMode) => void;
  selectRecord: (recordId: string | null) => void;
  selectRun: (summary: HistorySummary) => Promise<void>;
  refresh: () => Promise<void>;
  deleteRun: (id: string) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
}

interface HistoryState {
  mode: RunContextMode;
  summaries: HistorySummary[];
  selectedSummary: HistorySummary | null;
  selectedRun: HistoricalRun | null;
  selectedRecordId: string | null;
  listStatus: HistoryLoadStatus;
  detailStatus: HistoryLoadStatus;
  operation: HistoryOperation;
  error: ApiError | null;
}

type HistoryAction =
  | { type: 'list_loading' }
  | { type: 'list_loaded'; summaries: HistorySummary[] }
  | { type: 'list_failed'; error: ApiError }
  | { type: 'detail_failed'; error: ApiError }
  | { type: 'operation_failed'; error: ApiError }
  | { type: 'mode'; mode: RunContextMode }
  | { type: 'select_loading'; summary: HistorySummary }
  | { type: 'selected'; run: HistoricalRun }
  | { type: 'record'; recordId: string | null }
  | { type: 'operation'; operation: HistoryOperation }
  | { type: 'deleted'; id: string }
  | { type: 'cleared' }
  | { type: 'reset' };

export const initialHistoryState: HistoryState = {
  mode: 'current',
  summaries: [],
  selectedSummary: null,
  selectedRun: null,
  selectedRecordId: null,
  listStatus: 'idle',
  detailStatus: 'idle',
  operation: 'idle',
  error: null,
};

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'list_loading':
      return { ...state, listStatus: 'loading', error: null };
    case 'list_loaded': {
      const selectedSummary = state.selectedSummary
        ? (action.summaries.find((summary) => summary.id === state.selectedSummary?.id) ?? null)
        : null;
      return {
        ...state,
        summaries: action.summaries,
        selectedSummary,
        selectedRun:
          selectedSummary === null || state.selectedRun === null
            ? null
            : { ...state.selectedRun, summary: selectedSummary },
        listStatus: 'ready',
        error: null,
      };
    }
    case 'list_failed':
      return {
        ...state,
        listStatus: 'failed',
        error: action.error,
      };
    case 'detail_failed':
      return { ...state, detailStatus: 'failed', error: action.error };
    case 'operation_failed':
      return { ...state, operation: 'idle', error: action.error };
    case 'mode':
      return action.mode === 'historical'
        ? { ...state, mode: action.mode }
        : {
            ...state,
            mode: action.mode,
            selectedSummary: null,
            selectedRun: null,
            selectedRecordId: null,
            detailStatus: 'idle',
          };
    case 'select_loading':
      return {
        ...state,
        mode: 'historical',
        selectedSummary: action.summary,
        selectedRun: null,
        selectedRecordId: null,
        detailStatus: 'loading',
        error: null,
      };
    case 'selected':
      return {
        ...state,
        mode: 'historical',
        selectedSummary: action.run.summary,
        selectedRun: action.run,
        selectedRecordId: action.run.run.rootRecord
          ? historyRecordId(action.run, action.run.run.rootRecord)
          : null,
        detailStatus: 'ready',
        error: null,
      };
    case 'record':
      return { ...state, selectedRecordId: action.recordId };
    case 'operation':
      return { ...state, operation: action.operation, error: null };
    case 'deleted':
      return {
        ...state,
        mode: state.selectedSummary?.id === action.id ? 'history' : state.mode,
        summaries: state.summaries.filter((summary) => summary.id !== action.id),
        selectedSummary: state.selectedSummary?.id === action.id ? null : state.selectedSummary,
        selectedRun: state.selectedSummary?.id === action.id ? null : state.selectedRun,
        selectedRecordId: state.selectedSummary?.id === action.id ? null : state.selectedRecordId,
        detailStatus: state.selectedSummary?.id === action.id ? 'idle' : state.detailStatus,
        operation: 'idle',
      };
    case 'cleared':
      return {
        ...state,
        mode: 'history',
        summaries: [],
        selectedSummary: null,
        selectedRun: null,
        selectedRecordId: null,
        listStatus: 'ready',
        error: null,
        operation: 'idle',
      };
    case 'reset':
      return initialHistoryState;
  }
}

export function useRunHistory(scenarioIdentity: string, workspaceId: string): RunHistoryController {
  const [state, dispatch] = useReducer(historyReducer, initialHistoryState);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const token = ++requestRef.current;
    dispatch({ type: 'list_loading' });
    const result = await listRunHistory(workspaceId);
    if (!mountedRef.current || token !== requestRef.current) return;
    if (!result.ok) {
      dispatch({ type: 'list_failed', error: result.error });
      return;
    }
    dispatch({
      type: 'list_loaded',
      summaries: result.data.map(toHistorySummary).filter((summary) => summary.id !== ''),
    });
  }, [workspaceId]);

  useEffect(() => {
    mountedRef.current = true;
    requestRef.current += 1;
    dispatch({ type: 'reset' });
    void refresh();
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, [refresh, scenarioIdentity, workspaceId]);

  const setMode = useCallback((mode: RunContextMode) => {
    if (mode !== 'historical') requestRef.current += 1;
    dispatch({ type: 'mode', mode });
  }, []);
  const selectRecord = useCallback(
    (recordId: string | null) => dispatch({ type: 'record', recordId }),
    [],
  );

  const selectRun = useCallback(
    async (summary: HistorySummary) => {
      const token = ++requestRef.current;
      dispatch({ type: 'select_loading', summary });
      const result = await getRunHistory(summary.id, workspaceId);
      if (!mountedRef.current || token !== requestRef.current) return;
      if (!result.ok) {
        dispatch({ type: 'detail_failed', error: result.error });
        return;
      }
      dispatch({ type: 'selected', run: toHistoricalRun(result.data) });
    },
    [workspaceId],
  );

  const deleteRun = useCallback(
    async (id: string) => {
      const token = ++requestRef.current;
      dispatch({ type: 'operation', operation: 'deleting' });
      const result = await deleteRunHistory(id, workspaceId);
      if (!mountedRef.current || token !== requestRef.current) return false;
      if (!result.ok) {
        dispatch({ type: 'operation_failed', error: result.error });
        return false;
      }
      dispatch({ type: 'deleted', id });
      return true;
    },
    [workspaceId],
  );

  const clearAll = useCallback(async () => {
    const token = ++requestRef.current;
    dispatch({ type: 'operation', operation: 'clearing' });
    const result = await clearRunHistory(workspaceId);
    if (!mountedRef.current || token !== requestRef.current) return false;
    if (!result.ok) {
      dispatch({ type: 'operation_failed', error: result.error });
      return false;
    }
    dispatch({ type: 'cleared' });
    return true;
  }, [workspaceId]);

  return { ...state, setMode, selectRecord, selectRun, refresh, deleteRun, clearAll };
}
