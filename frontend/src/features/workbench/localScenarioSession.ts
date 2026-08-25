import type {
  ApiError,
  ScenarioDescriptor,
  ScenarioDiagnostic,
  ScenarioFileOperation,
} from './types';

// TODO: [Database] Persist imported scenario metadata across launches.
// TODO: [Workspace] Associate local scenarios with workspaces.
// TODO: [Files] Detect moved or deleted local scenario files.

export interface LocalScenarioSessionState {
  descriptors: ScenarioDescriptor[];
  operation: ScenarioFileOperation;
  error: ApiError | null;
  errorOperation: Exclude<ScenarioFileOperation, 'idle'> | null;
  diagnostics: ScenarioDiagnostic[];
  successMessage: string | null;
}

export const initialLocalScenarioSessionState: LocalScenarioSessionState = {
  descriptors: [],
  operation: 'idle',
  error: null,
  errorOperation: null,
  diagnostics: [],
  successMessage: null,
};

export type LocalScenarioSessionAction =
  | { type: 'listed'; descriptors: ScenarioDescriptor[] }
  | { type: 'operation_started'; operation: Exclude<ScenarioFileOperation, 'idle'> }
  | { type: 'operation_cancelled' }
  | {
      type: 'operation_succeeded';
      descriptor?: ScenarioDescriptor;
      message?: string;
    }
  | {
      type: 'operation_failed';
      error: ApiError;
      diagnostics?: ScenarioDiagnostic[];
    }
  | { type: 'feedback_cleared' };

function upsertByBackendID(
  current: ScenarioDescriptor[],
  descriptor: ScenarioDescriptor,
): ScenarioDescriptor[] {
  const existingIndex = current.findIndex((item) => item.id === descriptor.id);
  if (existingIndex === -1) return [...current, descriptor];

  return current.map((item, index) => (index === existingIndex ? descriptor : item));
}

export function localScenarioSessionReducer(
  state: LocalScenarioSessionState,
  action: LocalScenarioSessionAction,
): LocalScenarioSessionState {
  switch (action.type) {
    case 'listed':
      return {
        ...state,
        descriptors: action.descriptors,
      };
    case 'operation_started':
      return {
        ...state,
        operation: action.operation,
        error: null,
        errorOperation: null,
        diagnostics: [],
        successMessage: null,
      };
    case 'operation_cancelled':
      return {
        ...state,
        operation: 'idle',
        errorOperation: null,
      };
    case 'operation_succeeded':
      return {
        descriptors:
          action.descriptor === undefined
            ? state.descriptors
            : upsertByBackendID(state.descriptors, action.descriptor),
        operation: 'idle',
        error: null,
        errorOperation: null,
        diagnostics: [],
        successMessage: action.message ?? null,
      };
    case 'operation_failed':
      return {
        ...state,
        operation: 'idle',
        error: action.error,
        errorOperation: state.operation === 'idle' ? null : state.operation,
        diagnostics: action.diagnostics ?? [],
        successMessage: null,
      };
    case 'feedback_cleared':
      return {
        ...state,
        error: null,
        errorOperation: null,
        diagnostics: [],
        successMessage: null,
      };
  }
}
