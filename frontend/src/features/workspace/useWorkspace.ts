import { useCallback, useEffect, useReducer, useRef } from 'react';
import { api } from '../../../wailsjs/go/models';
import type { ApiError } from '../../api/result';
import {
  bootstrapWorkspace,
  createWorkspace,
  deleteWorkspace,
  renameWorkspace,
  retryWorkspacePersistence,
  setActiveWorkspace,
  setWorkspaceSelectedScenario,
} from '../../api/workspace';

type WorkspaceStatus = 'loading' | 'ready' | 'failed';
type WorkspaceOperation = 'idle' | 'creating' | 'renaming' | 'deleting' | 'switching' | 'retrying';

interface PendingAction {
  kind: 'switch' | 'delete' | 'home';
  workspaceId: string;
  dirty: boolean;
}

export interface WorkspaceState {
  status: WorkspaceStatus;
  operation: WorkspaceOperation;
  data: api.WorkspaceBootstrapData | null;
  error: ApiError | null;
  pending: PendingAction | null;
  recoveryConfirmation: boolean;
}

export type WorkspaceAction =
  | { type: 'loading'; operation: WorkspaceOperation }
  | { type: 'loaded'; data: api.WorkspaceBootstrapData }
  | { type: 'failed'; error: ApiError }
  | { type: 'error_cleared' }
  | { type: 'pending'; pending: PendingAction }
  | { type: 'pending_cleared' }
  | { type: 'recovery_confirmation'; value: boolean }
  | { type: 'persistence'; persistence: api.WorkspacePersistenceStatus }
  | { type: 'connection'; connection: api.ConnectionState };

export const initialWorkspaceState: WorkspaceState = {
  status: 'loading',
  operation: 'idle',
  data: null,
  error: null,
  pending: null,
  recoveryConfirmation: false,
};

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'loading':
      return { ...state, operation: action.operation, error: null };
    case 'loaded':
      return {
        status: 'ready',
        operation: 'idle',
        data: action.data,
        error: null,
        pending: null,
        recoveryConfirmation: false,
      };
    case 'failed':
      return {
        ...state,
        status: state.data === null ? 'failed' : 'ready',
        operation: 'idle',
        error: action.error,
      };
    case 'error_cleared':
      return { ...state, error: null };
    case 'pending':
      return { ...state, pending: action.pending, error: null };
    case 'pending_cleared':
      return { ...state, pending: null, error: null };
    case 'recovery_confirmation':
      return { ...state, recoveryConfirmation: action.value, operation: 'idle' };
    case 'persistence':
      return state.data === null
        ? state
        : {
            ...state,
            data: new api.WorkspaceBootstrapData({
              ...state.data,
              persistence: action.persistence,
            }),
          };
    case 'connection':
      return state.data === null
        ? state
        : {
            ...state,
            data: new api.WorkspaceBootstrapData({
              ...state.data,
              connection: action.connection,
              rememberedConnection: action.connection.active ?? state.data.rememberedConnection,
              persistence: action.connection.persistence ?? state.data.persistence,
            }),
          };
  }
}

export interface WorkspaceGuardState {
  runActive: boolean;
  draftDirty: boolean;
}

export interface WorkspaceController extends WorkspaceState {
  bootstrap(): Promise<boolean>;
  create(name: string): Promise<boolean>;
  rename(id: string, name: string): Promise<boolean>;
  requestSwitch(id: string, guards: WorkspaceGuardState): 'blocked' | 'confirm' | 'started';
  requestNavigateHome(guards: WorkspaceGuardState): 'blocked' | 'confirm' | 'started';
  requestDelete(id: string, guards: WorkspaceGuardState): 'blocked' | 'confirm';
  confirmPending(): Promise<boolean>;
  cancelPending(): void;
  retryPersistence(confirm?: boolean): Promise<void>;
  clearError(): void;
  cancelRecovery(): void;
  rememberScenario(source: 'example' | 'local', scenarioId: string): Promise<void>;
  applyPersistence(status: api.WorkspacePersistenceStatus | undefined): void;
  applyConnection(state: api.ConnectionState): void;
}

export function useWorkspace(): WorkspaceController {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const stateRef = useRef(state);
  const requestRef = useRef(0);
  const selectionRequestRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const applyRequest = useCallback(
    async (
      operation: WorkspaceOperation,
      request: () => ReturnType<typeof bootstrapWorkspace>,
    ): Promise<boolean> => {
      const token = ++requestRef.current;
      selectionRequestRef.current += 1;
      dispatch({ type: 'loading', operation });
      const result = await request();
      if (!mountedRef.current || token !== requestRef.current) return false;
      if (!result.ok) {
        dispatch({ type: 'failed', error: result.error });
        return false;
      }
      dispatch({ type: 'loaded', data: result.data });
      return true;
    },
    [],
  );

  const bootstrap = useCallback(() => applyRequest('idle', bootstrapWorkspace), [applyRequest]);

  useEffect(() => {
    mountedRef.current = true;
    void Promise.resolve().then(bootstrap);
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, [bootstrap]);

  const create = useCallback(
    (name: string) => applyRequest('creating', () => createWorkspace(name)),
    [applyRequest],
  );
  const rename = useCallback(
    (id: string, name: string) => applyRequest('renaming', () => renameWorkspace(id, name)),
    [applyRequest],
  );

  const executePending = useCallback(
    async (pending: PendingAction) => {
      if (pending.kind === 'home') return true;
      return applyRequest(pending.kind === 'switch' ? 'switching' : 'deleting', () =>
        pending.kind === 'switch'
          ? setActiveWorkspace(pending.workspaceId)
          : deleteWorkspace(pending.workspaceId),
      );
    },
    [applyRequest],
  );

  const requestSwitch = useCallback(
    (id: string, guards: WorkspaceGuardState): 'blocked' | 'confirm' | 'started' => {
      if (guards.runActive || stateRef.current.operation !== 'idle') return 'blocked';
      if (id === stateRef.current.data?.activeWorkspace.id) return 'started';
      const pending: PendingAction = { kind: 'switch', workspaceId: id, dirty: guards.draftDirty };
      if (guards.draftDirty) {
        dispatch({ type: 'pending', pending });
        return 'confirm';
      }
      void executePending(pending);
      return 'started';
    },
    [executePending],
  );

  const requestNavigateHome = useCallback(
    (guards: WorkspaceGuardState): 'blocked' | 'confirm' | 'started' => {
      if (guards.runActive || stateRef.current.operation !== 'idle') return 'blocked';
      if (guards.draftDirty) {
        dispatch({ type: 'pending', pending: { kind: 'home', workspaceId: '', dirty: true } });
        return 'confirm';
      }
      return 'started';
    },
    [],
  );

  const requestDelete = useCallback(
    (id: string, guards: WorkspaceGuardState): 'blocked' | 'confirm' => {
      if (guards.runActive || stateRef.current.operation !== 'idle') return 'blocked';
      dispatch({
        type: 'pending',
        pending: {
          kind: 'delete',
          workspaceId: id,
          dirty: guards.draftDirty && id === stateRef.current.data?.activeWorkspace.id,
        },
      });
      return 'confirm';
    },
    [],
  );

  const confirmPending = useCallback(async () => {
    const pending = stateRef.current.pending;
    if (pending === null) return false;
    if (pending.kind === 'home') {
      dispatch({ type: 'pending_cleared' });
      return true;
    }
    return executePending(pending);
  }, [executePending]);

  const retryPersistence = useCallback(async (confirm = false) => {
    const token = ++requestRef.current;
    selectionRequestRef.current += 1;
    dispatch({ type: 'loading', operation: 'retrying' });
    const result = await retryWorkspacePersistence(confirm);
    if (!mountedRef.current || token !== requestRef.current) return;
    if (!result.ok) {
      if (result.error.code === 'persistence_recovery_confirmation_required') {
        dispatch({ type: 'recovery_confirmation', value: true });
      } else {
        dispatch({ type: 'failed', error: result.error });
      }
      return;
    }
    dispatch({ type: 'loaded', data: result.data });
  }, []);

  const rememberScenario = useCallback(async (source: 'example' | 'local', scenarioId: string) => {
    const workspaceId = stateRef.current.data?.activeWorkspace.id;
    if (workspaceId === undefined) return;
    const token = ++selectionRequestRef.current;
    const result = await setWorkspaceSelectedScenario(workspaceId, source, scenarioId);
    if (
      !mountedRef.current ||
      token !== selectionRequestRef.current ||
      stateRef.current.data?.activeWorkspace.id !== workspaceId
    )
      return;
    if (!result.ok) dispatch({ type: 'failed', error: result.error });
    else dispatch({ type: 'persistence', persistence: result.data });
  }, []);

  const applyPersistence = useCallback(
    (persistence: api.WorkspacePersistenceStatus | undefined) => {
      if (persistence !== undefined) dispatch({ type: 'persistence', persistence });
    },
    [],
  );

  return {
    ...state,
    bootstrap,
    create,
    rename,
    requestSwitch,
    requestNavigateHome,
    requestDelete,
    confirmPending,
    cancelPending: () => dispatch({ type: 'pending_cleared' }),
    retryPersistence,
    clearError: () => dispatch({ type: 'error_cleared' }),
    cancelRecovery: () => dispatch({ type: 'recovery_confirmation', value: false }),
    rememberScenario,
    applyPersistence,
    applyConnection: (connection) => dispatch({ type: 'connection', connection }),
  };
}
