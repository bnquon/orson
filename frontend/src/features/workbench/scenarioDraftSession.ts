import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useLayoutEffect, useReducer } from 'react';
import { areScenarioDraftsEqual } from './draftEditing';
import type { LoadedScenario, ScenarioDraft, ScenarioFileOperationOutcome } from './types';

interface PendingSave {
  sourceScenarioId: string;
  submittedDraft: ScenarioDraft;
}

export interface ScenarioDraftSessionState {
  scenario: LoadedScenario;
  draft: ScenarioDraft;
  savedDraft: ScenarioDraft;
  pendingSave: PendingSave | null;
}

export type ScenarioDraftSessionAction =
  | { type: 'draft_changed'; update: SetStateAction<ScenarioDraft> }
  | { type: 'save_started'; submittedDraft: ScenarioDraft }
  | { type: 'save_failed' }
  | { type: 'scenario_received'; scenario: LoadedScenario };

export function createScenarioDraftSession(scenario: LoadedScenario): ScenarioDraftSessionState {
  return {
    scenario,
    draft: scenario.draft,
    savedDraft: scenario.draft,
    pendingSave: null,
  };
}

export function scenarioDraftSessionReducer(
  state: ScenarioDraftSessionState,
  action: ScenarioDraftSessionAction,
): ScenarioDraftSessionState {
  switch (action.type) {
    case 'draft_changed':
      return {
        ...state,
        draft: typeof action.update === 'function' ? action.update(state.draft) : action.update,
      };
    case 'save_started':
      return {
        ...state,
        pendingSave: {
          sourceScenarioId: state.scenario.id,
          submittedDraft: action.submittedDraft,
        },
      };
    case 'save_failed':
      return { ...state, pendingSave: null };
    case 'scenario_received': {
      if (state.scenario === action.scenario) return state;
      const preserveNewerEdits =
        state.pendingSave?.sourceScenarioId === state.scenario.id &&
        !areScenarioDraftsEqual(state.draft, state.pendingSave.submittedDraft);

      return {
        scenario: action.scenario,
        draft: preserveNewerEdits ? state.draft : action.scenario.draft,
        savedDraft: action.scenario.draft,
        pendingSave: null,
      };
    }
  }
}

export function useScenarioDraftSession(scenario: LoadedScenario): {
  draft: ScenarioDraft;
  savedDraft: ScenarioDraft;
  setDraft: Dispatch<SetStateAction<ScenarioDraft>>;
  markSaveStarted: (submittedDraft: ScenarioDraft) => void;
  markSaveFailed: () => void;
} {
  const [state, dispatch] = useReducer(
    scenarioDraftSessionReducer,
    scenario,
    createScenarioDraftSession,
  );

  useLayoutEffect(() => {
    dispatch({ type: 'scenario_received', scenario });
  }, [scenario]);

  const setDraft = useCallback<Dispatch<SetStateAction<ScenarioDraft>>>((update) => {
    dispatch({ type: 'draft_changed', update });
  }, []);
  const markSaveStarted = useCallback((submittedDraft: ScenarioDraft) => {
    dispatch({ type: 'save_started', submittedDraft });
  }, []);
  const markSaveFailed = useCallback(() => dispatch({ type: 'save_failed' }), []);

  return {
    draft: state.draft,
    savedDraft: state.savedDraft,
    setDraft,
    markSaveStarted,
    markSaveFailed,
  };
}

export async function runScenarioDraftSave(input: {
  submittedDraft: ScenarioDraft;
  markSaveStarted(draft: ScenarioDraft): void;
  save(): Promise<ScenarioFileOperationOutcome>;
  markSaveFailed(): void;
}): Promise<ScenarioFileOperationOutcome> {
  input.markSaveStarted(input.submittedDraft);
  const outcome = await input.save();
  if (outcome !== 'succeeded') input.markSaveFailed();
  return outcome;
}
