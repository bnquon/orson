import { useEffect, useMemo, useRef, useState, type FormEvent, type SubmitEvent } from 'react';
import {
  CheckCircle,
  CodeBrackets,
  DotArrowRight,
  FloppyDiskArrowIn,
  InfoCircle,
  WarningCircle,
  Xmark,
} from 'iconoir-react';
import { LoadingDots } from '../../components/LoadingDots';
import { Modal, ModalActions, ModalButton } from '../../components/Modal';
import { Toast } from '../../components/Toast';
import { Tooltip } from '../../components/Tooltip';
import { previewScenarioYaml } from '../../api/scenario';
import { ComposePanel } from './components/ComposePanel';
import { FolderNameDialog } from './components/FolderNameDialog';
import { FlowPanel } from './components/FlowPanel';
import { HistoricalRunPanel } from './components/HistoricalRunPanel';
import { HistoricalRunToolbar } from './components/HistoricalRunToolbar';
import { RunContextPanel } from './components/RunContextPanel';
import { ScenarioBrowser } from './components/ScenarioBrowser';
import { ScenarioFileActions } from './components/ScenarioFileActions';
import {
  ScenarioYamlPreviewModal,
  type ScenarioYamlPreviewState,
} from './components/ScenarioYamlPreviewModal';
import { WorkbenchShell } from './components/WorkbenchShell';
import { WorkspaceToolbar } from './components/WorkspaceToolbar';
import {
  ScenarioDiagnostics,
  ScenarioFileOperationError,
  ScenarioSelectionLoadError,
} from './components/ScenarioLoadState';
import { buildFlowViewModel } from './flowModel';
import { toObservedRun } from './observedRun';
import { formatStatusLabel, isActiveRunStatus, terminalRunStatuses } from './runStatus';
import { toRunRequest } from './runMapping';
import { toScenarioDiagnostic, toScenarioDraftData, toScenarioWarning } from './scenarioMapping';
import { useScenarioDraftSession } from './scenarioDraftSession';
import { useScenarioFileOperations } from './useScenarioFileOperations';
import { useRun } from './useRun';
import { useRunHistory } from './useRunHistory';
import type { ComposeEditorTab, TouchedState, ValidatableField, WorkspaceMode } from './types';
import { getJsonError, validateScenario } from './validation';
import type { WorkbenchPageProps } from './workbenchPageTypes';
import './styles/controls.css';

const initialTouched: TouchedState = {
  fields: {},
  watchedTopicIds: [],
  headerIds: [],
};

export function WorkbenchPage({
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
  const saveAsMissingItems = new Set<string>();
  const saveValidationLabels: Partial<Record<ValidatableField, string>> = {
    name: 'scenario name',
    rootTopic: 'root topic',
    watchedTopics: 'valid watched topics',
    headers: 'valid custom headers',
    payload: 'valid JSON payload',
    captureTimeoutSeconds: 'valid capture timeout',
  };
  for (const field of Object.keys(
    fileOperations.saveValidation.fieldErrors,
  ) as ValidatableField[]) {
    const item = saveValidationLabels[field];
    if (item !== undefined) saveAsMissingItems.add(item);
  }
  if (Object.keys(fileOperations.saveValidation.watchedTopicErrors).length > 0) {
    saveAsMissingItems.add('valid watched topics');
  }
  if (Object.keys(fileOperations.saveValidation.headerErrors).length > 0) {
    saveAsMissingItems.add('valid custom headers');
  }
  const saveAsHint =
    fileOperations.saveBlocker === 'invalid'
      ? `Missing or fix:\n${[...saveAsMissingItems].map((item) => `• ${item}`).join('\n')}`
      : fileOperations.saveAsDisabledReason;

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

  const fileActions = showEmptyWorkbench ? (
    <span />
  ) : scenario.source === 'unsaved' ? (
    <div className="scenario-file-actions scenario-file-actions--unsaved">
      <button
        className="scenario-file-button"
        type="button"
        onClick={onExitUnsavedScenario}
        disabled={
          isRunActive ||
          fileOperations.fileBusy ||
          scenarioCatalogLoading ||
          history.mode === 'historical'
        }
        title={
          isRunActive
            ? 'Stop the active run before exiting'
            : fileOperations.fileBusy
              ? 'Wait for the current scenario file operation to finish'
              : scenarioCatalogLoading
                ? 'Wait for the scenario refresh to finish'
                : history.mode === 'historical'
                  ? 'Return to the current workspace to edit scenarios'
                  : 'Exit without saving this scenario'
        }
      >
        <Xmark width={15} height={15} /> Exit without saving
      </button>
    </div>
  ) : (
    <ScenarioFileActions
      source={scenario.source}
      sourceFilename={scenario.sourceFilename}
      readOnly={history.mode === 'historical'}
      dirty={fileOperations.draftIsDirty}
      saveDisabled={fileOperations.saveDisabled}
      saveAsDisabled={fileOperations.saveDisabled}
      saveDisabledReason={fileOperations.saveDisabledReason}
      saveAsDisabledReason={fileOperations.saveAsDisabledReason}
      operation={fileFeedback.operation}
      onSave={() => void fileOperations.saveDraft()}
      onSaveAs={() => void fileOperations.saveDraftAs()}
      previewDisabled={yamlPreviewDisabled}
      previewDisabledReason={yamlPreviewDisabledReason}
      previewing={yamlPreviewLoading}
      onPreview={openYamlPreview}
    />
  );
  let publishTitle = `Publish to ${connection.name} · ${connection.brokers.join(', ')}`;
  if (fileOperations.fileBusy) {
    publishTitle = 'Wait for the scenario file operation to finish';
  } else if (scenarioCatalogLoading) {
    publishTitle = 'Wait for the scenario refresh to finish';
  } else if (scenarioSelectionLoading) {
    publishTitle = 'Wait for the selected scenario to finish loading';
  }
  const unsavedYamlPreviewAction = (
    <button
      className="compose-secondary-button"
      type="button"
      onClick={openYamlPreview}
      disabled={yamlPreviewDisabled}
      title={yamlPreviewDisabled ? yamlPreviewDisabledReason : 'View canonical YAML'}
    >
      {yamlPreviewLoading ? (
        <LoadingDots size="inline" />
      ) : (
        <CodeBrackets width={16} height={16} aria-hidden="true" />
      )}
      View YAML
    </button>
  );
  const publishAction = showEmptyWorkbench ? (
    <span />
  ) : history.mode === 'historical' ? (
    <span className="publish-summary" aria-label="Historical run is read-only">
      Read-only run
    </span>
  ) : isRunActive ? (
    <>
      {scenario.source === 'unsaved' ? unsavedYamlPreviewAction : null}
      <button
        className="publish-button publish-button--stop"
        type="button"
        onClick={() => void run.stopRun()}
        title="Stop the active run"
      >
        <LoadingDots size="inline" /> Stop
      </button>
    </>
  ) : scenario.source === 'unsaved' ? (
    <span className="workspace-toolbar__save-action">
      {fileOperations.saveDisabled ? (
        <Tooltip label="Why Save as is unavailable" content={saveAsHint} interactive multiline>
          <InfoCircle width={16} height={16} aria-hidden="true" />
        </Tooltip>
      ) : null}
      {unsavedYamlPreviewAction}
      <button
        className="publish-button"
        type="button"
        onClick={() => void fileOperations.saveDraftAs()}
        disabled={fileOperations.saveDisabled}
        title={
          fileOperations.saveDisabled
            ? fileOperations.saveAsDisabledReason
            : 'Save scenario as YAML'
        }
      >
        <FloppyDiskArrowIn width={18} height={18} /> Save as
      </button>
    </span>
  ) : (
    <>
      <span
        className={`publish-summary ${publishAttempted && validation.issueCount > 0 ? 'publish-summary--invalid' : ''}`}
        aria-live="polite"
      >
        {publishAttempted ? (
          validation.issueCount > 0 ? (
            <>
              <WarningCircle width={16} height={16} /> {validation.issueCount}{' '}
              {validation.issueCount === 1 ? 'issue' : 'issues'}
            </>
          ) : (
            <>
              <CheckCircle width={16} height={16} /> Ready
            </>
          )
        ) : null}
      </span>
      <button
        className="publish-button"
        type={mode === 'compose' ? 'submit' : 'button'}
        form={mode === 'compose' ? 'compose-form' : undefined}
        onClick={mode === 'flow' ? publishRun : undefined}
        disabled={fileOperations.fileBusy || scenarioSelectionLoading}
        title={publishTitle}
      >
        Publish <DotArrowRight width={20} height={20} strokeWidth={1.5} />
      </button>
    </>
  );

  const scenarioSidebar = (
    <ScenarioBrowser
      examples={examples}
      localScenarios={localScenarios}
      selectedScenarioId={selectedScenarioId}
      activeScenarioId={scenario.id}
      activeScenarioName={showEmptyWorkbench ? '' : draft.name}
      activeScenarioUnsaved={scenario.source === 'unsaved' && !emptyWorkbench}
      scenarioLoadingId={scenarioLoadingId}
      scenarioCatalogLoading={scenarioCatalogLoading}
      readOnly={history.mode === 'historical'}
      examplesExpanded={examplesExpanded}
      examplesDismissed={examplesDismissed}
      onExamplesExpandedChange={onExamplesExpandedChange}
      onExamplesDismissedChange={onExamplesDismissedChange}
      scenarioSelectionDisabled={fileOperations.scenarioSelectionDisabled}
      scenarioRemovalDisabled={scenario.source === 'unsaved'}
      activeScenarioDirty={showEmptyWorkbench ? false : fileOperations.draftIsDirty}
      fileOperation={fileFeedback.operation}
      fileError={fileFeedback.error}
      fileErrorOperation={fileFeedback.errorOperation}
      fileActions={fileActions}
      onSelectScenario={fileOperations.requestScenarioSelection}
      onNewScenario={showEmptyWorkbench ? onCreateScenario : fileOperations.requestNewScenario}
      onImportScenario={showEmptyWorkbench ? onImportScenario : fileOperations.requestImport}
      onRemoveScenario={onRemoveScenario}
      localFolders={localFolders}
      folderOperation={folderOperation}
      folderError={folderParentId === null ? folderError : null}
      onClearFolderError={onClearFolderError}
      onRequestCreateFolder={folderMutationDisabled ? undefined : openFolderDialog}
      onRenameFolder={onRenameFolder}
      onDeleteFolder={onDeleteFolder}
      onMoveFolder={onMoveFolder}
      onReorderFolder={onReorderFolder}
      onMoveScenario={onMoveScenario}
    />
  );
  const workspaceToolbar = showEmptyWorkbench ? (
    <div />
  ) : history.mode === 'historical' && history.selectedSummary !== null ? (
    <HistoricalRunToolbar
      summary={history.selectedSummary}
      onReturnToCurrent={() => history.setMode('current')}
    />
  ) : (
    <WorkspaceToolbar
      mode={mode}
      onModeChange={setMode}
      scenario={{
        name: draft.name,
        rootTopic: draft.rootTopic,
        source: scenario.source,
        sourceFilename: scenario.sourceFilename,
        sourcePath: scenario.sourcePath,
        dirty: fileOperations.draftIsDirty,
      }}
      warnings={{
        count: scenario.warnings.length,
        dismissed: scenarioWarningsDismissed,
        onRestore: restoreScenarioWarnings,
      }}
      action={publishAction}
    />
  );

  const scenarioDiagnostics = (
    <>
      {fileFeedback.error ? (
        <ScenarioFileOperationError
          error={fileFeedback.error}
          diagnostics={fileFeedback.diagnostics}
          onDismiss={fileOperations.clearFileFeedback}
        />
      ) : null}
      <ScenarioDiagnostics
        warnings={scenario.warnings}
        sourceFilename={scenario.sourceFilename}
        dismissed={scenarioWarningsDismissed}
        onDismiss={dismissScenarioWarnings}
      />
      {selectedLoadError && selectedDescriptor?.id !== scenario.id ? (
        <ScenarioSelectionLoadError
          descriptor={selectedDescriptor}
          error={selectedLoadError}
          diagnostics={selectedDiagnostics}
          onRetry={selectedLoadError.retryable ? () => void onRetrySelectedScenario() : undefined}
        />
      ) : null}
    </>
  );

  return (
    <>
      <WorkbenchShell
        connection={connection}
        workspaceSelector={workspaceSelector}
        onNavigateHome={onNavigateHome}
        connectionDialogOpen={connectionDialogOpen}
        onConnectionToggle={onConnectionToggle}
        sidebar={scenarioSidebar}
        toolbar={workspaceToolbar}
        workspaceMode={mode}
        workspaceAriaLabel={
          showEmptyWorkbench
            ? 'No scenario selected'
            : history.mode === 'historical'
              ? 'Historical run detail'
              : undefined
        }
        workspaceInert={
          fileFeedback.operation === 'importing' || fileFeedback.operation === 'removing'
        }
        workspace={
          showEmptyWorkbench ? (
            <>
              {scenarioDiagnostics}
              <div className="workspace-empty-state" role="status">
                <strong>No scenario selected</strong>
                <span>Select a scenario or import a YAML file from the sidebar to begin.</span>
              </div>
            </>
          ) : history.mode === 'historical' ? (
            <HistoricalRunPanel
              run={history.selectedRun}
              detailStatus={history.detailStatus}
              errorMessage={history.error?.message ?? null}
              selectedRecordId={history.selectedRecordId}
              onSelectRecord={history.selectRecord}
              onBackToHistory={() => history.setMode('history')}
            />
          ) : mode === 'compose' ? (
            <>
              {scenarioDiagnostics}
              <ComposePanel
                connection={connection}
                draft={draft}
                setDraft={setDraft}
                rootTopicEditRef={rootTopicEditRef}
                activeEditorTab={activeEditorTab}
                onEditorTabChange={setActiveEditorTab}
                touched={touched}
                validation={validation}
                jsonError={jsonValidation.error}
                jsonValidationPending={jsonValidationPending}
                configHeight={composeConfigHeight}
                onConfigHeightChange={setComposeConfigHeight}
                onReviewConnection={onConnectionToggle}
                onTouchField={touchField}
                onTouchWatchedTopic={touchWatchedTopic}
                onTouchHeader={touchHeader}
                onSubmit={handlePublish}
              />
            </>
          ) : (
            <>
              {scenarioDiagnostics}
              <FlowPanel
                model={flowModel}
                selectedRecordId={run.state.selectedRecordId}
                onSelectRecord={(recordId) => run.selectRecord(recordId)}
              />
            </>
          )
        }
        previousRun={
          <RunContextPanel
            currentRun={liveRun}
            currentSelectedEventId={run.state.selectedRecordId}
            currentSelectedEvent={selectedEvent}
            onSelectCurrentEvent={(recordId) => run.selectRecord(recordId)}
            history={history}
          />
        }
        runStatus={formatStatusLabel(run.state.status)}
        runStatusLabel={history.mode === 'historical' ? 'Viewing historical run' : undefined}
        statusDetail={
          showEmptyWorkbench
            ? 'Select a scenario to begin'
            : history.mode === 'historical'
              ? 'Read-only snapshot · return to the current workspace to edit'
              : scenario.source === 'local'
                ? 'Imported files are remembered for this session'
                : scenario.source === 'unsaved'
                  ? 'Unsaved scenario · save as YAML to keep it'
                  : 'Examples are read-only'
        }
      />
      <FolderNameDialog
        open={folderParentId !== null}
        parentName={folderParentName}
        value={folderName}
        error={folderError?.message || folderNameError}
        busy={folderOperation === 'creating'}
        onChange={setFolderName}
        onClose={closeFolderDialog}
        onSubmit={submitFolder}
      />
      {yamlPreviewOpen ? (
        <ScenarioYamlPreviewModal
          open
          preview={yamlPreview}
          onClose={() => setYamlPreviewOpen(false)}
        />
      ) : null}
      {fileFeedback.successMessage ? (
        <Toast
          message={fileFeedback.successMessage}
          tone="success"
          onDismiss={fileOperations.clearFileFeedback}
        />
      ) : null}
      {run.historyError ? (
        <Toast
          message={run.historyError.message}
          tone="error"
          onDismiss={() => run.clearHistoryError()}
        />
      ) : null}
      <Modal
        open={fileOperations.pendingScenarioAction !== null}
        title="Discard local changes?"
        description={
          fileOperations.pendingScenarioAction?.kind === 'import'
            ? 'Importing another file will replace the current editable draft if it succeeds.'
            : fileOperations.pendingScenarioAction?.kind === 'new'
              ? 'Creating a new scenario will replace the current editable draft.'
              : 'Switching scenarios will replace the current editable draft.'
        }
        onClose={fileOperations.cancelPendingScenarioAction}
        footer={
          <ModalActions>
            <ModalButton type="button" onClick={fileOperations.cancelPendingScenarioAction}>
              Cancel
            </ModalButton>
            <ModalButton
              tone="danger"
              type="button"
              onClick={fileOperations.confirmPendingScenarioAction}
            >
              Discard changes
            </ModalButton>
          </ModalActions>
        }
      >
        <p className="scenario-switch-copy">
          Any unsaved edits to <strong>{draft.name}</strong> will be lost after the next scenario
          loads successfully.{' '}
          {fileOperations.pendingScenarioAction?.kind === 'new'
            ? 'This scenario has not been saved to disk.'
            : scenario.source === 'example'
              ? 'The example file remains unchanged.'
              : 'The file on disk remains unchanged.'}
        </p>
      </Modal>
    </>
  );
}
