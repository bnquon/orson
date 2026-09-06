import { useEffect, useMemo, useRef, useState, type FormEvent, type SubmitEvent } from 'react';
import { previewScenarioYaml } from '../../api/scenario';
import type { ScenarioYamlPreviewState } from './components/ScenarioYamlPreviewModal';
import { buildFlowViewModel } from './flowModel';
import type { HistoricalRun } from './historyTypes';
import { toObservedRun } from './observedRun';
import { isActiveRunStatus, terminalRunStatuses } from './runStatus';
import { toRunRequest } from './runMapping';
import { toScenarioDiagnostic, toScenarioDraftData, toScenarioWarning } from './scenarioMapping';
import { useScenarioDraftSession } from './scenarioDraftSession';
import { useScenarioFileOperations } from './useScenarioFileOperations';
import { useRun } from './useRun';
import { useRunHistory } from './useRunHistory';
import { useTopologyEditing } from './useTopologyEditing';
import type { ComposeEditorTab, TouchedState, ValidatableField, WorkspaceMode } from './types';
import { getJsonError, validateScenario } from './validation';
import type { WorkbenchPageProps } from './workbenchPageTypes';

const initialTouched: TouchedState = {
  fields: {},
  watchedTopicIds: [],
  headerIds: [],
};

export function useWorkbenchPage({
  workspaceId,
  connection,
  scenario: scenarioModel,
  emptyWorkbench = false,
  shell,
  onWorkspaceGuardChange,
}: WorkbenchPageProps) {
  const scenario = scenarioModel.active;
  const {
    examples,
    localScenarios,
    selectedScenarioId,
    selectedDescriptor,
    selectedLoadError,
    selectedDiagnostics,
    scenarioLoadingId,
    scenarioCatalogLoading,
    examplesExpanded,
    examplesDismissed,
    onExamplesExpandedChange,
    onExamplesDismissedChange,
  } = scenarioModel.catalog;
  const {
    fileFeedback,
    onSelectScenario,
    onCreateScenario,
    onLoadDraftAsUnsaved,
    onExitUnsavedScenario,
    onImportScenario,
    onRemoveScenario,
    onSaveScenario,
    onSaveScenarioAs,
    onClearFileFeedback,
    onRetrySelectedScenario,
  } = scenarioModel.files;
  const {
    localFolders,
    folderOperation,
    folderError,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onMoveFolder,
    onReorderFolder,
    onMoveScenario,
    onClearFolderError,
  } = scenarioModel.folders;
  const { connectionDialogOpen, onConnectionToggle, onNavigateHome, workspaceSelector } = shell;
  const [mode, setMode] = useState<WorkspaceMode>('compose');
  const [folderParentId, setFolderParentId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderNameError, setFolderNameError] = useState('');
  const { draft, savedDraft, setDraft, markSaveStarted, markSaveFailed } =
    useScenarioDraftSession(scenario);
  const [activeEditorTab, setActiveEditorTab] = useState<ComposeEditorTab>('payload');
  const [touched, setTouched] = useState<TouchedState>(initialTouched);
  const [publishAttempted, setPublishAttempted] = useState(false);
  const [pendingHistoricalLoad, setPendingHistoricalLoad] = useState<HistoricalRun | null>(null);
  const [historyLoadFeedback, setHistoryLoadFeedback] = useState<string | null>(null);
  const [composeConfigHeight, setComposeConfigHeight] = useState<number | null>(null);
  const scenarioIdentity = scenario.id;
  const [warningDismissal, setWarningDismissal] = useState({
    scenarioIdentity,
    dismissed: false,
  });
  const [yamlPreviewOpen, setYamlPreviewOpen] = useState(false);
  const [yamlPreview, setYamlPreview] = useState<ScenarioYamlPreviewState>({ status: 'idle' });
  const yamlPreviewRequestRef = useRef(0);
  const rootTopicEditRef = useRef<string | null>(null);
  const [jsonValidation, setJsonValidation] = useState(() => ({
    payload: scenario.draft.payload,
    error: getJsonError(scenario.draft.payload),
  }));
  const run = useRun();
  const history = useRunHistory(scenario.id, workspaceId);
  const refreshHistory = history.refresh;
  const previousScenarioIdRef = useRef(scenario.id);
  const refreshedRunRef = useRef<string | null>(null);

  useEffect(() => {
    if (previousScenarioIdRef.current === scenario.id) return;
    previousScenarioIdRef.current = scenario.id;

    setMode('compose');
    setActiveEditorTab('payload');
    setTouched(initialTouched);
    setPublishAttempted(false);
    setComposeConfigHeight(null);
    setWarningDismissal({ scenarioIdentity: scenario.id, dismissed: false });
    yamlPreviewRequestRef.current += 1;
    setYamlPreviewOpen(false);
    setYamlPreview({ status: 'idle' });
    rootTopicEditRef.current = null;
    run.resetRun();
  }, [run, scenario.id]);

  useEffect(() => {
    if (scenario.source !== 'unsaved') return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('compose-scenario-name')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scenario.id, scenario.source]);

  useEffect(() => {
    const runId = run.state.runId;
    if (runId === null || !terminalRunStatuses.has(run.state.status)) return;
    const refreshKey = `${runId}:${run.state.status}`;
    if (refreshedRunRef.current === refreshKey) return;
    refreshedRunRef.current = refreshKey;
    void refreshHistory();
  }, [refreshHistory, run.state.runId, run.state.status]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setJsonValidation({ payload: draft.payload, error: getJsonError(draft.payload) });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [draft.payload]);

  const scenarioWarningsDismissed =
    warningDismissal.scenarioIdentity === scenarioIdentity && warningDismissal.dismissed;
  const dismissScenarioWarnings = () => setWarningDismissal({ scenarioIdentity, dismissed: true });
  const restoreScenarioWarnings = () => setWarningDismissal({ scenarioIdentity, dismissed: false });
  const jsonValidationPending = jsonValidation.payload !== draft.payload;
  const validation = useMemo(
    () => validateScenario(draft, connection, jsonValidation.error),
    [connection, draft, jsonValidation.error],
  );
  const liveRun = useMemo(() => toObservedRun(run.state, 'live'), [run.state]);
  const flowModel = useMemo(() => buildFlowViewModel(draft, run.state), [draft, run.state]);
  const topologyEditing = useTopologyEditing(draft, setDraft);
  const selectedEvent =
    liveRun.events.find((event) => event.id === run.state.selectedRecordId) ?? null;
  const isRunActive = isActiveRunStatus(run.state.status);
  const scenarioSelectionLoading = scenarioLoadingId !== null || scenarioCatalogLoading;
  const yamlPreviewLoading = yamlPreview.status === 'loading';
  const yamlPreviewDisabled = scenarioSelectionLoading || yamlPreviewLoading;
  const yamlPreviewDisabledReason = scenarioSelectionLoading
    ? 'Wait for the selected scenario to finish loading'
    : yamlPreviewLoading
      ? 'Wait for the YAML preview to finish loading'
      : '';
  const fileOperations = useScenarioFileOperations({
    scenario,
    examples,
    localScenarios,
    selectedScenarioId,
    draft,
    savedDraft,
    jsonError: jsonValidation.error,
    jsonValidationPending,
    runActive: isRunActive,
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
  });
  const flowEditingDisabled = isRunActive || scenarioSelectionLoading || fileOperations.fileBusy;
  const flowEditingDisabledReason = isRunActive
    ? 'Stop the active run before editing the topology'
    : scenarioSelectionLoading
      ? 'Wait for the selected scenario to finish loading'
      : fileOperations.fileBusy
        ? 'Wait for the current scenario file operation to finish'
        : '';
  const historyLoadDisabledReason =
    history.detailStatus !== 'ready' || history.selectedRun === null
      ? 'Wait for the historical run to finish loading'
      : isRunActive
        ? 'Stop the active run before loading a historical draft'
        : fileOperations.fileBusy
          ? 'Wait for the current scenario file operation to finish'
          : scenarioSelectionLoading
            ? 'Wait for the selected scenario to finish loading'
            : folderOperation !== 'idle'
              ? 'Wait for the current folder operation to finish'
              : history.operation !== 'idle'
                ? 'Wait for the current history operation to finish'
                : '';
  const historyLoadDisabled = historyLoadDisabledReason !== '';

  useEffect(() => {
    onWorkspaceGuardChange({
      runActive: isRunActive,
      draftDirty: emptyWorkbench ? false : fileOperations.draftIsDirty,
    });
  }, [emptyWorkbench, fileOperations.draftIsDirty, isRunActive, onWorkspaceGuardChange]);

  const showEmptyWorkbench = emptyWorkbench && !isRunActive && history.mode !== 'historical';

  const openFolderDialog = (parentId = '') => {
    onClearFolderError();
    setFolderParentId(parentId);
    setFolderName('');
    setFolderNameError('');
  };
  const closeFolderDialog = () => {
    if (folderOperation === 'idle') {
      onClearFolderError();
      setFolderParentId(null);
    }
  };
  const submitFolder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (folderParentId === null) return;
    setFolderNameError('');
    void onCreateFolder(folderName, folderParentId).then((success) => {
      if (success) setFolderParentId(null);
      else setFolderNameError('The folder could not be created. Check the name and try again.');
    });
  };
  const folderParentName = localFolders.find((folder) => folder.id === folderParentId)?.name ?? '';
  const folderMutationDisabled =
    history.mode === 'historical' ||
    isRunActive ||
    fileOperations.fileBusy ||
    scenarioSelectionLoading ||
    folderOperation !== 'idle';
  const touchField = (field: ValidatableField) => {
    setTouched((current) => ({
      ...current,
      fields: { ...current.fields, [field]: true },
    }));
  };

  const touchWatchedTopic = (topicId: string) => {
    setTouched((current) => ({
      ...current,
      watchedTopicIds: current.watchedTopicIds.includes(topicId)
        ? current.watchedTopicIds
        : [...current.watchedTopicIds, topicId],
    }));
  };

  const touchHeader = (headerId: string) => {
    setTouched((current) => ({
      ...current,
      headerIds: current.headerIds.includes(headerId)
        ? current.headerIds
        : [...current.headerIds, headerId],
    }));
  };

  const loadHistoricalDraft = (historical: HistoricalRun) => {
    onLoadDraftAsUnsaved(historical.scenario);
    setMode('compose');
    history.setMode('current');
    setPendingHistoricalLoad(null);
    setHistoryLoadFeedback('Historical run loaded into Compose as an unsaved draft.');
  };

  const requestHistoricalDraftLoad = () => {
    const historical = history.selectedRun;
    if (historical === null || historyLoadDisabled) return;
    if (!emptyWorkbench && fileOperations.draftIsDirty) {
      setPendingHistoricalLoad(historical);
      return;
    }
    loadHistoricalDraft(historical);
  };

  const cancelPendingDraftReplacement = () => {
    if (pendingHistoricalLoad !== null) {
      setPendingHistoricalLoad(null);
      return;
    }
    fileOperations.cancelPendingScenarioAction();
  };

  const confirmPendingDraftReplacement = () => {
    if (pendingHistoricalLoad !== null) {
      loadHistoricalDraft(pendingHistoricalLoad);
      return;
    }
    fileOperations.confirmPendingScenarioAction();
  };

  const publishRun = () => {
    if (history.mode === 'historical' || fileOperations.fileBusy || scenarioSelectionLoading)
      return;
    const currentJsonError = getJsonError(draft.payload);
    const currentValidation = validateScenario(draft, connection, currentJsonError);

    setJsonValidation({ payload: draft.payload, error: currentJsonError });
    setPublishAttempted(true);
    setTouched({
      fields: {
        connection: true,
        rootTopic: true,
        watchedTopics: true,
        headers: true,
        payload: true,
        captureTimeoutSeconds: true,
        name: true,
      },
      watchedTopicIds: draft.watchedTopics.map((topic) => topic.id),
      headerIds: draft.headers.reduce<string[]>((ids, header) => {
        if (!header.protected) ids.push(header.id);
        return ids;
      }, []),
    });

    if (currentValidation.firstInvalidControlId !== null) {
      if (mode === 'flow') setMode('compose');
      if (Object.keys(currentValidation.headerErrors).length > 0) {
        setActiveEditorTab('headers');
      } else if (currentValidation.fieldErrors.payload !== undefined) {
        setActiveEditorTab('payload');
      }

      window.requestAnimationFrame(() => {
        document.getElementById(currentValidation.firstInvalidControlId ?? '')?.focus();
      });
      return;
    }

    history.setMode('current');
    void run.startRun(
      toRunRequest(draft, {
        source: scenario.source,
        scenarioId: scenario.source === 'unsaved' ? undefined : scenario.id,
        sourcePath: scenario.source === 'unsaved' ? undefined : scenario.sourcePath,
        sourceFilename: scenario.source === 'unsaved' ? undefined : scenario.sourceFilename,
        displayName: draft.name,
      }),
    );
  };

  const handlePublish = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    publishRun();
  };

  const openYamlPreview = () => {
    if (history.mode === 'historical' || yamlPreviewDisabled) return;

    const requestId = ++yamlPreviewRequestRef.current;
    const sourceFilename =
      scenario.source === 'unsaved' ? '' : scenario.sourceFilename || 'scenario.yaml';
    setYamlPreviewOpen(true);
    setYamlPreview({ status: 'loading' });

    void previewScenarioYaml(toScenarioDraftData(draft), sourceFilename).then((result) => {
      if (yamlPreviewRequestRef.current !== requestId) return;

      if (result.ok) {
        setYamlPreview({
          status: 'ready',
          yaml: result.data.yaml,
          warnings: result.data.warnings.map((warning) =>
            toScenarioWarning(warning, sourceFilename),
          ),
        });
        return;
      }

      setYamlPreview({
        status: 'failed',
        error: result.error,
        diagnostics: result.diagnostics.map((diagnostic) =>
          toScenarioDiagnostic(diagnostic, sourceFilename),
        ),
      });
    });
  };

  return {
    connection,
    emptyWorkbench,
    scenario,
    examples,
    localScenarios,
    selectedScenarioId,
    selectedDescriptor,
    selectedLoadError,
    selectedDiagnostics,
    scenarioLoadingId,
    scenarioCatalogLoading,
    examplesExpanded,
    examplesDismissed,
    onExamplesExpandedChange,
    onExamplesDismissedChange,
    fileFeedback,
    onSelectScenario,
    onCreateScenario,
    onExitUnsavedScenario,
    onImportScenario,
    onRemoveScenario,
    onRetrySelectedScenario,
    localFolders,
    folderOperation,
    folderError,
    onRenameFolder,
    onDeleteFolder,
    onMoveFolder,
    onReorderFolder,
    onMoveScenario,
    onClearFolderError,
    connectionDialogOpen,
    onConnectionToggle,
    onNavigateHome,
    workspaceSelector,
    mode,
    setMode,
    folderParentId,
    folderName,
    setFolderName,
    folderNameError,
    draft,
    setDraft,
    activeEditorTab,
    setActiveEditorTab,
    touched,
    publishAttempted,
    pendingHistoricalLoad,
    historyLoadFeedback,
    setHistoryLoadFeedback,
    composeConfigHeight,
    setComposeConfigHeight,
    yamlPreviewOpen,
    setYamlPreviewOpen,
    yamlPreview,
    rootTopicEditRef,
    jsonValidation,
    run,
    history,
    scenarioWarningsDismissed,
    dismissScenarioWarnings,
    restoreScenarioWarnings,
    jsonValidationPending,
    validation,
    liveRun,
    flowModel,
    topologyEditing,
    selectedEvent,
    isRunActive,
    scenarioSelectionLoading,
    yamlPreviewLoading,
    yamlPreviewDisabled,
    yamlPreviewDisabledReason,
    fileOperations,
    flowEditingDisabled,
    flowEditingDisabledReason,
    historyLoadDisabledReason,
    historyLoadDisabled,
    showEmptyWorkbench,
    openFolderDialog,
    closeFolderDialog,
    submitFolder,
    folderParentName,
    folderMutationDisabled,
    touchField,
    touchWatchedTopic,
    touchHeader,
    requestHistoricalDraftLoad,
    cancelPendingDraftReplacement,
    confirmPendingDraftReplacement,
    publishRun,
    handlePublish,
    openYamlPreview,
  };
}

export type WorkbenchPageState = ReturnType<typeof useWorkbenchPage>;
