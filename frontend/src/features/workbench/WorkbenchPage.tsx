import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle, DotArrowRight, WarningCircle } from 'iconoir-react';
import { LoadingDots } from '../../components/LoadingDots';
import { api } from '../../../wailsjs/go/models';
import { ComposePanel } from './components/ComposePanel';
import { FlowPanel } from './components/FlowPanel';
import { PreviousRunPanel } from './components/PreviousRunPanel';
import { WorkbenchShell } from './components/WorkbenchShell';
import { ScenarioDiagnostics } from './components/ScenarioLoadState';
import { buildFlowViewModel, getRunRecordId } from './flowModel';
import { formatStatusLabel, isActiveRunStatus } from './runStatus';
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
} from './types';
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
  connectionDialogOpen: boolean;
  onConnectionToggle: () => void;
}

export function WorkbenchPage({
  connection,
  scenario,
  connectionDialogOpen,
  onConnectionToggle,
}: WorkbenchPageProps) {
  const [mode, setMode] = useState<WorkspaceMode>('compose');
  const [draft, setDraft] = useState<ScenarioDraft>(() => scenario.draft);
  const [activeEditorTab, setActiveEditorTab] = useState<ComposeEditorTab>('payload');
  const [touched, setTouched] = useState<TouchedState>(initialTouched);
  const [publishAttempted, setPublishAttempted] = useState(false);
  const [composeConfigHeight, setComposeConfigHeight] = useState<number | null>(null);
  const scenarioIdentity = `${scenario.name}\u0000${scenario.sourceFilename}`;
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
      headerIds: draft.headers.filter((header) => !header.protected).map((header) => header.id),
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
      new api.RunRequest({
        rootTopic: draft.rootTopic.trim(),
        messageKey: draft.messageKey,
        payload: draft.payload,
        headers: draft.headers.map((header) => ({ key: header.name, value: header.value })),
        watchedTopics: draft.watchedTopics.map((topic) => topic.name.trim()),
        captureTimeoutSeconds: Number(draft.captureTimeoutSeconds),
      }),
    );
  };

  const handlePublish = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    publishRun();
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
    <ScenarioDiagnostics
      warnings={scenario.warnings}
      sourceFilename={scenario.sourceFilename}
      dismissed={scenarioWarningsDismissed}
      onDismiss={dismissScenarioWarnings}
    />
  );

  return (
    <WorkbenchShell
      connection={connection}
      scenarioName={scenario.name}
      scenarioRootTopic={scenario.draft.rootTopic}
      scenarioWarningCount={scenario.warnings.length}
      scenarioWarningsDismissed={scenarioWarningsDismissed}
      onRestoreScenarioWarnings={restoreScenarioWarnings}
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
  );
}
