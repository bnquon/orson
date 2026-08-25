import { useEffect, useLayoutEffect, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { CheckCircle, DotArrowRight, WarningCircle } from 'iconoir-react';
import { LoadingDots } from '../../components/LoadingDots';
import { Modal } from '../../components/Modal';
import { ComposePanel } from './components/ComposePanel';
import { FlowPanel } from './components/FlowPanel';
import { PreviousRunPanel } from './components/PreviousRunPanel';
import { WorkbenchShell } from './components/WorkbenchShell';
import { ScenarioDiagnostics, ScenarioSelectionLoadError } from './components/ScenarioLoadState';
import { areScenarioDraftsEqual } from './draftEditing';
import { buildFlowViewModel, getRunRecordId } from './flowModel';
import { formatStatusLabel, isActiveRunStatus } from './runStatus';
import { toRunRequest } from './runMapping';
import { useRun } from './useRun';
import type {
  ComposeEditorTab,
  EventRecord,
  KafkaConnection,
  ScenarioDraft,
  TouchedState,
  ValidatableField,
  WorkspaceMode,
  ObservedEvent,
  LoadedScenario,
  ScenarioDescriptor,
  ScenarioDiagnostic,
} from './types';
import type { ApiError } from '../../api/result';
import { getJsonError, validateScenario } from './validation';
import './styles/controls.css';

const initialTouched: TouchedState = {
  fields: {},
  watchedTopicIds: [],
  headerIds: [],
};

function toObservedEvent(runId: string, record: EventRecord, isRoot: boolean): ObservedEvent {
  const id = getRunRecordId(runId, record);
  return {
    id,
    name: isRoot ? 'Root event published' : record.topic,
    topic: record.topic,
    kind: isRoot ? ('root' as const) : ('downstream' as const),
    timestamp: record.timestamp || 'Timestamp unavailable',
    elapsed: '',
    partition: record.partition,
    offset: record.offset,
    metadata: `Kafka · ${record.value.length} B · observed live`,
    headers: record.headers.map((header) => ({ name: header.key, value: header.value })),
    payload: record.value,
  };
}

interface WorkbenchPageProps {
  connection: KafkaConnection;
  scenario: LoadedScenario;
  scenarios: ScenarioDescriptor[];
  selectedScenarioId: string | null;
  selectedDescriptor: ScenarioDescriptor | null;
  selectedLoadError: ApiError | null;
  selectedDiagnostics: ScenarioDiagnostic[];
  scenarioLoadingId: string | null;
  scenarioCatalogLoading: boolean;
  onSelectScenario: (id: string) => Promise<void>;
  onRetrySelectedScenario: () => Promise<void>;
  connectionDialogOpen: boolean;
  onConnectionToggle: () => void;
}

export function WorkbenchPage({
  connection,
  scenario,
  scenarios,
  selectedScenarioId,
  selectedDescriptor,
  selectedLoadError,
  selectedDiagnostics,
  scenarioLoadingId,
  scenarioCatalogLoading,
  onSelectScenario,
  onRetrySelectedScenario,
  connectionDialogOpen,
  onConnectionToggle,
}: WorkbenchPageProps) {
  const [mode, setMode] = useState<WorkspaceMode>('compose');
  const [draft, setDraft] = useState<ScenarioDraft>(() => scenario.draft);
  const [activeEditorTab, setActiveEditorTab] = useState<ComposeEditorTab>('payload');
  const [touched, setTouched] = useState<TouchedState>(initialTouched);
  const [publishAttempted, setPublishAttempted] = useState(false);
  const [pendingScenarioId, setPendingScenarioId] = useState<string | null>(null);
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
  const previousScenarioIdRef = useRef(scenario.id);

  useLayoutEffect(() => {
    if (previousScenarioIdRef.current === scenario.id) return;

    previousScenarioIdRef.current = scenario.id;
    setDraft(scenario.draft);
    setMode('compose');
    setActiveEditorTab('payload');
    setTouched(initialTouched);
    setPublishAttempted(false);
    setPendingScenarioId(null);
    setComposeConfigHeight(null);
    setWarningDismissal({ scenarioIdentity: scenario.id, dismissed: false });
    rootTopicEditRef.current = null;
    setJsonValidation({
      payload: scenario.draft.payload,
      error: getJsonError(scenario.draft.payload),
    });
    run.resetRun();
  }, [run, scenario.draft, scenario.id]);

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
  const draftIsDirty = !areScenarioDraftsEqual(draft, scenario.draft);

  const jsonValidationPending = jsonValidation.payload !== draft.payload;
  const validation = useMemo(
    () => validateScenario(draft, connection, jsonValidation.error),
    [connection, draft, jsonValidation.error],
  );
  const liveRun = useMemo(
    () => ({
      id: run.state.runId ?? '—',
      status: run.state.status,
      error: run.state.error,
      trackedEvents: run.state.trackedEvents,
      events: run.state.records.map((record) =>
        toObservedEvent(run.state.runId ?? 'pending', record, run.state.rootRecord === record),
      ),
    }),
    [run.state],
  );
  const flowModel = useMemo(() => buildFlowViewModel(draft, run.state), [draft, run.state]);
  const selectedEvent =
    liveRun.events.find((event) => event.id === run.state.selectedRecordId) ?? null;

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

    void run.startRun(toRunRequest(draft));
  };

  const handlePublish = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    publishRun();
  };

  const requestScenarioSelection = (id: string) => {
    if (isRunActive) return;
    if (id === scenario.id) {
      if (selectedScenarioId !== id) void onSelectScenario(id);
      return;
    }
    const descriptor = scenarios.find((item) => item.id === id);
    if (descriptor?.status !== 'invalid' && draftIsDirty) {
      setPendingScenarioId(id);
      return;
    }
    void onSelectScenario(id);
  };

  const confirmScenarioSelection = () => {
    if (pendingScenarioId === null) return;
    const nextId = pendingScenarioId;
    setPendingScenarioId(null);
    void onSelectScenario(nextId);
  };

  const isRunActive = isActiveRunStatus(run.state.status);
  const publishAction = isRunActive ? (
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
        title={`Publish to ${connection.name} · ${connection.brokers.join(', ')}`}
      >
        Publish <DotArrowRight width={20} height={20} strokeWidth={1.5} />
      </button>
    </>
  );

  const scenarioDiagnostics = (
    <>
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
        scenarioName={scenario.name}
        scenarioRootTopic={scenario.draft.rootTopic}
        scenarioWarningCount={scenario.warnings.length}
        scenarioWarningsDismissed={scenarioWarningsDismissed}
        onRestoreScenarioWarnings={restoreScenarioWarnings}
        scenarios={scenarios}
        selectedScenarioId={selectedScenarioId}
        activeScenarioId={scenario.id}
        scenarioLoadingId={scenarioLoadingId}
        scenarioCatalogLoading={scenarioCatalogLoading}
        scenarioSelectionDisabled={isRunActive || pendingScenarioId !== null}
        onSelectScenario={requestScenarioSelection}
        connectionDialogOpen={connectionDialogOpen}
        mode={mode}
        onModeChange={setMode}
        onConnectionToggle={onConnectionToggle}
        action={publishAction}
        workspace={
          mode === 'compose' ? (
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
          <PreviousRunPanel
            run={liveRun}
            selectedEventId={run.state.selectedRecordId}
            selectedEvent={selectedEvent}
            onSelectEvent={(recordId) => run.selectRecord(recordId)}
          />
        }
        runStatus={formatStatusLabel(run.state.status)}
      />
      <Modal
        open={pendingScenarioId !== null}
        title="Discard local changes?"
        description="Switching scenarios will replace the current editable draft."
        onClose={() => setPendingScenarioId(null)}
        footer={
          <div className="scenario-switch-actions">
            <button
              type="button"
              className="connection-secondary-button"
              onClick={() => setPendingScenarioId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="scenario-discard-button"
              onClick={confirmScenarioSelection}
            >
              Discard changes
            </button>
          </div>
        }
      >
        <p className="scenario-switch-copy">
          Any edits to <strong>{scenario.name}</strong> will be lost. The bundled YAML file remains
          unchanged.
        </p>
      </Modal>
    </>
  );
}
