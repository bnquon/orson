import { useCallback, type Dispatch, type RefObject } from 'react';
import type { api } from '../../../wailsjs/go/models';
import {
  importLocalScenario,
  removeLocalScenario,
  saveLocalScenario,
  saveScenarioAs,
  type ScenarioFileResult,
} from '../../api/scenario';
import type { LocalScenarioSessionAction } from './localScenarioSession';
import { applyScenarioFileResult } from './scenarioFileResult';
import { protocolError } from './scenarioErrors';
import { toScenarioDiagnostic, type ScenarioDraftData } from './scenarioMapping';
import type { LoadedScenario, ScenarioDescriptor, ScenarioFileOperationOutcome } from './types';
import type { WorkspaceRequestOutcome } from '../workspace/useWorkspace';

interface ScenarioFileOptions {
  scenario: LoadedScenario | null;
  dispatchLocalSession: Dispatch<LocalScenarioSessionAction>;
  activateScenario: (loaded: LoadedScenario, selectedId?: string | null) => void;
  mountedRef: RefObject<boolean>;
  onPersistence: (status: api.WorkspacePersistenceStatus | undefined) => void;
  onRememberScenario: (source: 'example' | 'local', scenarioId: string) => Promise<void>;
  refreshLocalDescriptors: () => Promise<ScenarioDescriptor[] | null>;
  scenarioBeforeUnsavedRef: RefObject<LoadedScenario | null>;
  activeScenarioIdRef: RefObject<string | null>;
  clearScenarioSelection: (showBlankWorkbench: boolean) => void;
  bootstrapIdentityRef: RefObject<string>;
  onRetryBootstrap: () => Promise<WorkspaceRequestOutcome>;
}

export function useScenarioFiles({
  scenario,
  dispatchLocalSession,
  activateScenario,
  mountedRef,
  onPersistence,
  onRememberScenario,
  refreshLocalDescriptors,
  scenarioBeforeUnsavedRef,
  activeScenarioIdRef,
  clearScenarioSelection,
  bootstrapIdentityRef,
  onRetryBootstrap,
}: ScenarioFileOptions) {
  const handleFileResult = useCallback(
    (
      result: ScenarioFileResult,
      successMessage: (descriptor: ScenarioDescriptor) => string,
    ): ScenarioFileOperationOutcome =>
      applyScenarioFileResult(result, scenario?.sourceFilename ?? 'scenario.yaml', successMessage, {
        dispatch: dispatchLocalSession,
        activate: activateScenario,
      }),
    [activateScenario, dispatchLocalSession, scenario?.sourceFilename],
  );

  const importScenario = useCallback(async (): Promise<ScenarioFileOperationOutcome> => {
    dispatchLocalSession({ type: 'operation_started', operation: 'importing' });
    const result = await importLocalScenario();
    if (!mountedRef.current) return 'cancelled';
    if (result.ok) onPersistence(result.data.persistence);
    if (!result.ok) await refreshLocalDescriptors();
    const outcome = handleFileResult(
      result,
      (descriptor) => `${descriptor.sourceFilename} imported`,
    );
    if (result.ok && result.data.descriptor !== undefined) {
      void onRememberScenario('local', result.data.descriptor.id);
    }
    return outcome;
  }, [
    dispatchLocalSession,
    handleFileResult,
    mountedRef,
    onPersistence,
    onRememberScenario,
    refreshLocalDescriptors,
  ]);

  const saveScenario = useCallback(
    async (draft: ScenarioDraftData): Promise<ScenarioFileOperationOutcome> => {
      if (scenario === null || scenario.source !== 'local') return 'failed';
      dispatchLocalSession({ type: 'operation_started', operation: 'saving' });
      const result = await saveLocalScenario(scenario.id, draft);
      if (!mountedRef.current) return 'cancelled';
      if (result.ok) onPersistence(result.data.persistence);
      if (
        !result.ok &&
        ['scenario_file_changed', 'scenario_file_missing', 'scenario_read_failed'].includes(
          result.error.code,
        )
      ) {
        await refreshLocalDescriptors();
      }
      return handleFileResult(result, (descriptor) => `${descriptor.sourceFilename} saved`);
    },
    [
      dispatchLocalSession,
      handleFileResult,
      mountedRef,
      onPersistence,
      refreshLocalDescriptors,
      scenario,
    ],
  );

  const saveActiveScenarioAs = useCallback(
    async (draft: ScenarioDraftData): Promise<ScenarioFileOperationOutcome> => {
      dispatchLocalSession({ type: 'operation_started', operation: 'saving_as' });
      const result = await saveScenarioAs(draft);
      if (!mountedRef.current) return 'cancelled';
      if (result.ok) onPersistence(result.data.persistence);
      const outcome = handleFileResult(
        result,
        (descriptor) => `${descriptor.sourceFilename} saved`,
      );
      if (result.ok && result.data.descriptor !== undefined) {
        void onRememberScenario('local', result.data.descriptor.id);
      }
      return outcome;
    },
    [dispatchLocalSession, handleFileResult, mountedRef, onPersistence, onRememberScenario],
  );

  const removeScenario = useCallback(
    async (id: string): Promise<ScenarioFileOperationOutcome> => {
      if (scenario?.source === 'unsaved') {
        dispatchLocalSession({
          type: 'operation_failed',
          error: protocolError(
            'Save or exit the unsaved scenario before removing another scenario.',
          ),
        });
        return 'failed';
      }
      dispatchLocalSession({ type: 'operation_started', operation: 'removing' });
      const result = await removeLocalScenario(id);
      if (!mountedRef.current) return 'cancelled';
      if (!result.ok) {
        dispatchLocalSession({
          type: 'operation_failed',
          error: result.error,
          diagnostics: result.diagnostics.map((diagnostic) =>
            toScenarioDiagnostic(diagnostic, scenario?.sourceFilename ?? id),
          ),
        });
        return 'failed';
      }
      onPersistence(result.data.persistence);
      if (scenarioBeforeUnsavedRef.current?.id === id) {
        scenarioBeforeUnsavedRef.current = null;
      }
      dispatchLocalSession({ type: 'removed', id });
      if (activeScenarioIdRef.current === id) {
        clearScenarioSelection(false);
      }
      bootstrapIdentityRef.current = '';
      const refreshed = await onRetryBootstrap();
      if (!mountedRef.current) return 'cancelled';
      if (refreshed === 'failed') {
        dispatchLocalSession({
          type: 'operation_failed',
          error: protocolError('Scenario removed, but the workspace could not be refreshed.'),
        });
        return 'failed';
      }
      if (refreshed === 'superseded') {
        dispatchLocalSession({ type: 'operation_cancelled' });
        return 'cancelled';
      }
      dispatchLocalSession({ type: 'operation_succeeded', message: 'Scenario import removed' });
      return 'succeeded';
    },
    [
      activeScenarioIdRef,
      bootstrapIdentityRef,
      clearScenarioSelection,
      dispatchLocalSession,
      mountedRef,
      onPersistence,
      onRetryBootstrap,
      scenario?.source,
      scenario?.sourceFilename,
      scenarioBeforeUnsavedRef,
    ],
  );

  const clearFileFeedback = useCallback(() => {
    dispatchLocalSession({ type: 'feedback_cleared' });
  }, [dispatchLocalSession]);

  return { importScenario, saveScenario, saveActiveScenarioAs, removeScenario, clearFileFeedback };
}
