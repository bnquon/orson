import { useCallback, useEffect, useMemo, useState } from 'react';
import { areScenarioDraftsEqual } from './draftEditing';
import { toScenarioDraftData, type ScenarioDraftData } from './scenarioMapping';
import { runScenarioDraftSave } from './scenarioDraftSession';
import {
  decideScenarioAction,
  executeScenarioAction,
  getScenarioFileBlocker,
  getScenarioFileDisabledReason,
  type PendingScenarioAction,
} from './scenarioFileGuards';
import type {
  LoadedScenario,
  ScenarioDescriptor,
  ScenarioDraft,
  ScenarioFileFeedback,
  ScenarioFileOperationOutcome,
} from './types';
import { validateScenarioDraft } from './validation';

interface UseScenarioFileOperationsInput {
  scenario: LoadedScenario;
  examples: ScenarioDescriptor[];
  localScenarios: ScenarioDescriptor[];
  selectedScenarioId: string | null;
  draft: ScenarioDraft;
  savedDraft: ScenarioDraft;
  jsonError: string | null;
  jsonValidationPending: boolean;
  runActive: boolean;
  scenarioSelectionLoading: boolean;
  fileFeedback: ScenarioFileFeedback;
  markSaveStarted: (draft: ScenarioDraft) => void;
  markSaveFailed: () => void;
  onSelectScenario: (id: string) => Promise<void>;
  onCreateScenario: () => void;
  onImportScenario: () => Promise<ScenarioFileOperationOutcome>;
  onSaveScenario: (draft: ScenarioDraftData) => Promise<ScenarioFileOperationOutcome>;
  onSaveScenarioAs: (draft: ScenarioDraftData) => Promise<ScenarioFileOperationOutcome>;
  onClearFileFeedback: () => void;
}

export function useScenarioFileOperations({
  scenario,
  examples,
  localScenarios,
  selectedScenarioId,
  draft,
  savedDraft,
  jsonError,
  jsonValidationPending,
  runActive,
  scenarioSelectionLoading,
  fileFeedback,
  markSaveStarted,
  markSaveFailed,
  onSelectScenario,
  onCreateScenario,
  onImportScenario,
  onSaveScenario,
  onSaveScenarioAs,
  onClearFileFeedback,
}: UseScenarioFileOperationsInput) {
  const [pendingScenarioAction, setPendingScenarioAction] = useState<PendingScenarioAction | null>(
    null,
  );
  const scenarios = useMemo(() => [...examples, ...localScenarios], [examples, localScenarios]);
  const saveValidation = useMemo(() => validateScenarioDraft(draft, jsonError), [draft, jsonError]);
  const draftIsDirty = scenario.source === 'unsaved' || !areScenarioDraftsEqual(draft, savedDraft);
  const fileBusy = fileFeedback.operation !== 'idle';
  const fileBlocker = getScenarioFileBlocker({
    runActive,
    fileBusy,
    selectionLoading: scenarioSelectionLoading,
    validationPending: jsonValidationPending,
    issueCount: saveValidation.issueCount,
  });
  const saveDisabled = fileBlocker !== null;

  useEffect(() => {
    if (fileFeedback.successMessage === null) return;
    const timeoutId = window.setTimeout(onClearFileFeedback, 2600);
    return () => window.clearTimeout(timeoutId);
  }, [fileFeedback.successMessage, onClearFileFeedback]);

  const requestScenarioSelection = useCallback(
    (id: string) => {
      const descriptor = scenarios.find((item) => item.id === id);
      const decision = decideScenarioAction({
        kind: 'select',
        runActive,
        selectionLoading: scenarioSelectionLoading,
        draftDirty: draftIsDirty,
        currentScenarioId: scenario.id,
        target: descriptor,
      });
      if (decision === 'blocked') return;
      if (id === scenario.id && selectedScenarioId === id) return;
      if (decision === 'confirm') {
        setPendingScenarioAction({ kind: 'select', id });
        return;
      }
      void onSelectScenario(id);
    },
    [
      draftIsDirty,
      onSelectScenario,
      runActive,
      scenario.id,
      scenarioSelectionLoading,
      scenarios,
      selectedScenarioId,
    ],
  );

  const requestImport = useCallback(() => {
    const decision = decideScenarioAction({
      kind: 'import',
      runActive,
      selectionLoading: scenarioSelectionLoading,
      draftDirty: draftIsDirty,
      currentScenarioId: scenario.id,
    });
    if (decision === 'blocked') return;
    if (decision === 'confirm') {
      setPendingScenarioAction({ kind: 'import' });
      return;
    }
    void onImportScenario();
  }, [draftIsDirty, onImportScenario, runActive, scenario.id, scenarioSelectionLoading]);

  const requestNewScenario = useCallback(() => {
    if (runActive || fileBusy || scenarioSelectionLoading) return;
    const decision = decideScenarioAction({
      kind: 'new',
      runActive,
      selectionLoading: scenarioSelectionLoading,
      draftDirty: draftIsDirty,
      currentScenarioId: scenario.id,
    });
    if (decision === 'blocked') return;
    if (decision === 'confirm') {
      setPendingScenarioAction({ kind: 'new' });
      return;
    }
    onCreateScenario();
  }, [draftIsDirty, fileBusy, onCreateScenario, runActive, scenario.id, scenarioSelectionLoading]);

  const cancelPendingScenarioAction = useCallback(() => setPendingScenarioAction(null), []);

  const confirmPendingScenarioAction = useCallback(() => {
    if (pendingScenarioAction === null) return;
    setPendingScenarioAction(null);
    executeScenarioAction(pendingScenarioAction, {
      importScenario: () => void onImportScenario(),
      selectScenario: (id) => void onSelectScenario(id),
      newScenario: onCreateScenario,
    });
  }, [onCreateScenario, onImportScenario, onSelectScenario, pendingScenarioAction]);

  const saveDraft = useCallback(async () => {
    if (saveDisabled || !draftIsDirty || scenario.source !== 'local') return;
    const submittedDraft = draft;
    await runScenarioDraftSave({
      submittedDraft,
      markSaveStarted,
      save: () => onSaveScenario(toScenarioDraftData(submittedDraft)),
      markSaveFailed,
    });
  }, [
    draft,
    draftIsDirty,
    markSaveFailed,
    markSaveStarted,
    onSaveScenario,
    saveDisabled,
    scenario.source,
  ]);

  const saveDraftAs = useCallback(async () => {
    if (saveDisabled) return;
    const submittedDraft = draft;
    await runScenarioDraftSave({
      submittedDraft,
      markSaveStarted,
      save: () => onSaveScenarioAs(toScenarioDraftData(submittedDraft)),
      markSaveFailed,
    });
  }, [draft, markSaveFailed, markSaveStarted, onSaveScenarioAs, saveDisabled]);

  const saveDisabledReason = getScenarioFileDisabledReason(fileBlocker, 'save');
  const saveAsDisabledReason = getScenarioFileDisabledReason(fileBlocker, 'save_as');

  return {
    draftIsDirty,
    fileBusy,
    pendingScenarioAction,
    scenarioSelectionDisabled: runActive || pendingScenarioAction !== null,
    saveDisabled,
    saveDisabledReason,
    saveAsDisabledReason,
    requestScenarioSelection,
    requestImport,
    requestNewScenario,
    cancelPendingScenarioAction,
    confirmPendingScenarioAction,
    saveDraft,
    saveDraftAs,
    clearFileFeedback: onClearFileFeedback,
  };
}
