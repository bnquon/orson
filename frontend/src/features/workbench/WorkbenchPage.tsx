import { useEffect, useMemo, useRef, useState, type ReactNode, type SubmitEvent } from 'react';
import type { WorkspaceGuardState } from '../workspace/useWorkspace';
import { CheckCircle, DotArrowRight, WarningCircle } from 'iconoir-react';
import { LoadingDots } from '../../components/LoadingDots';
import { Modal, ModalActions, ModalButton } from '../../components/Modal';
import { Toast } from '../../components/Toast';
import { ComposePanel } from './components/ComposePanel';
import { FlowPanel } from './components/FlowPanel';
import { HistoricalRunPanel } from './components/HistoricalRunPanel';
import { HistoricalRunToolbar } from './components/HistoricalRunToolbar';
import { RunContextPanel } from './components/RunContextPanel';
import { ScenarioBrowser } from './components/ScenarioBrowser';
import { ScenarioFileActions } from './components/ScenarioFileActions';
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
import type { ScenarioDraftData } from './scenarioMapping';
import { useScenarioDraftSession } from './scenarioDraftSession';
import { useScenarioFileOperations } from './useScenarioFileOperations';
import { useRun } from './useRun';
import { useRunHistory } from './useRunHistory';
import type {
  ComposeEditorTab,
  KafkaConnection,
  TouchedState,
  ValidatableField,
  WorkspaceMode,
  LoadedScenario,
  ScenarioDescriptor,
  ScenarioDiagnostic,
  ScenarioFileFeedback,
  ScenarioFileOperationOutcome,
} from './types';
import type { ApiError } from '../../api/result';
import { getJsonError, validateScenario } from './validation';
import './styles/controls.css';

const initialTouched: TouchedState = {
  fields: {},
  watchedTopicIds: [],
  headerIds: [],
};

interface WorkbenchPageProps {
  workspaceId: string;
  connection: KafkaConnection;
  scenario: LoadedScenario;
  examples: ScenarioDescriptor[];
  localScenarios: ScenarioDescriptor[];
  selectedScenarioId: string | null;
  selectedDescriptor: ScenarioDescriptor | null;
  selectedLoadError: ApiError | null;
  selectedDiagnostics: ScenarioDiagnostic[];
  scenarioLoadingId: string | null;
  scenarioCatalogLoading: boolean;
  examplesExpanded: boolean;
  examplesDismissed: boolean;
  onExamplesExpandedChange: (expanded: boolean) => void;
  onExamplesDismissedChange: (dismissed: boolean) => void;
  fileFeedback: ScenarioFileFeedback;
  onSelectScenario: (id: string) => Promise<void>;
  onCreateScenario: () => void;
  onImportScenario: () => Promise<ScenarioFileOperationOutcome>;
  onRemoveScenario: (id: string) => Promise<ScenarioFileOperationOutcome>;
  onSaveScenario: (draft: ScenarioDraftData) => Promise<ScenarioFileOperationOutcome>;
  onSaveScenarioAs: (draft: ScenarioDraftData) => Promise<ScenarioFileOperationOutcome>;
  onClearFileFeedback: () => void;
  onRetrySelectedScenario: () => Promise<void>;
  connectionDialogOpen: boolean;
  onConnectionToggle: () => void;
  onNavigateHome: () => void;
  workspaceSelector: ReactNode;
  onWorkspaceGuardChange: (guards: WorkspaceGuardState) => void;
}

export function WorkbenchPage({
  workspaceId,
  connection,
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
  onImportScenario,
  onRemoveScenario,
  onSaveScenario,
  onSaveScenarioAs,
  onClearFileFeedback,
  onRetrySelectedScenario,
  connectionDialogOpen,
  onConnectionToggle,
  onNavigateHome,
  workspaceSelector,
  onWorkspaceGuardChange,
}: WorkbenchPageProps) {
  const [mode, setMode] = useState<WorkspaceMode>('compose');
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
  const scenarioSelectionLoading = scenarioLoadingId !== null;
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
    onWorkspaceGuardChange({ runActive: isRunActive, draftDirty: fileOperations.draftIsDirty });
  }, [fileOperations.draftIsDirty, isRunActive, onWorkspaceGuardChange]);

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

  const fileActions = (
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
    />
  );
  let publishTitle = `Publish to ${connection.name} · ${connection.brokers.join(', ')}`;
  if (fileOperations.fileBusy) {
    publishTitle = 'Wait for the scenario file operation to finish';
  } else if (scenarioSelectionLoading) {
    publishTitle = 'Wait for the selected scenario to finish loading';
  }
  const publishAction =
    history.mode === 'historical' ? (
      <span className="publish-summary" aria-label="Historical run is read-only">
        Read-only run
      </span>
    ) : isRunActive ? (
      <button
        className="publish-button publish-button--stop"
        type="button"
        onClick={() => void run.stopRun()}
        title="Stop the active run"
      >
        <LoadingDots size="inline" /> Stop
      </button>
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
      activeScenarioName={draft.name}
      activeScenarioUnsaved={scenario.source === 'unsaved'}
      scenarioLoadingId={scenarioLoadingId}
      scenarioCatalogLoading={scenarioCatalogLoading}
      readOnly={history.mode === 'historical'}
      examplesExpanded={examplesExpanded}
      examplesDismissed={examplesDismissed}
      onExamplesExpandedChange={onExamplesExpandedChange}
      onExamplesDismissedChange={onExamplesDismissedChange}
      scenarioSelectionDisabled={fileOperations.scenarioSelectionDisabled}
      activeScenarioDirty={fileOperations.draftIsDirty}
      fileOperation={fileFeedback.operation}
      fileError={fileFeedback.error}
      fileErrorOperation={fileFeedback.errorOperation}
      fileActions={fileActions}
      onSelectScenario={fileOperations.requestScenarioSelection}
      onNewScenario={fileOperations.requestNewScenario}
      onImportScenario={fileOperations.requestImport}
      onRemoveScenario={onRemoveScenario}
    />
  );
  const workspaceToolbar =
    history.mode === 'historical' && history.selectedSummary !== null ? (
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
        workspaceAriaLabel={history.mode === 'historical' ? 'Historical run detail' : undefined}
        workspaceInert={
          fileFeedback.operation === 'importing' || fileFeedback.operation === 'removing'
        }
        workspace={
          history.mode === 'historical' ? (
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
          history.mode === 'historical'
            ? 'Read-only snapshot · return to the current workspace to edit'
            : scenario.source === 'local'
              ? 'Imported files are remembered for this session'
              : scenario.source === 'unsaved'
                ? 'Unsaved scenario · save as YAML to keep it'
                : 'Examples are read-only'
        }
      />
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
