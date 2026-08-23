import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle, DotArrowRight, WarningCircle } from 'iconoir-react';
import { ComposePanel } from './components/ComposePanel';
import { FlowPanel } from './components/FlowPanel';
import { PreviousRunPanel } from './components/PreviousRunPanel';
import { WorkbenchShell } from './components/WorkbenchShell';
import { initialScenario, previousRun } from './fixtures';
import type {
  ComposeEditorTab,
  KafkaConnection,
  ScenarioDraft,
  TouchedState,
  ValidatableField,
  WorkspaceMode,
} from './types';
import { getJsonError, validateScenario } from './validation';
import './styles/controls.css';

const initialTouched: TouchedState = {
  fields: {},
  watchedTopicIds: [],
  headerIds: [],
};

interface WorkbenchPageProps {
  connection: KafkaConnection;
  connectionDialogOpen: boolean;
  onConnectionToggle: () => void;
}

export function WorkbenchPage({
  connection,
  connectionDialogOpen,
  onConnectionToggle,
}: WorkbenchPageProps) {
  const [mode, setMode] = useState<WorkspaceMode>('compose');
  const [draft, setDraft] = useState<ScenarioDraft>(initialScenario);
  const [activeEditorTab, setActiveEditorTab] = useState<ComposeEditorTab>('payload');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [touched, setTouched] = useState<TouchedState>(initialTouched);
  const [publishAttempted, setPublishAttempted] = useState(false);
  const [composeConfigHeight, setComposeConfigHeight] = useState<number | null>(null);
  const [jsonValidation, setJsonValidation] = useState(() => ({
    payload: initialScenario.payload,
    error: getJsonError(initialScenario.payload),
  }));

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setJsonValidation({ payload: draft.payload, error: getJsonError(draft.payload) });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [draft.payload]);

  const jsonValidationPending = jsonValidation.payload !== draft.payload;
  const validation = useMemo(
    () => validateScenario(draft, connection, jsonValidation.error),
    [connection, draft, jsonValidation.error],
  );
  const selectedEvent = previousRun.events.find((event) => event.id === selectedEventId) ?? null;

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

  const handlePublish = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      if (Object.keys(currentValidation.headerErrors).length > 0) {
        setActiveEditorTab('headers');
      } else if (currentValidation.fieldErrors.payload !== undefined) {
        setActiveEditorTab('payload');
      }

      window.requestAnimationFrame(() => {
        document.getElementById(currentValidation.firstInvalidControlId ?? '')?.focus();
      });
    }
  };

  const composeAction = (
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
        type="submit"
        form="compose-form"
        title={`Publish to ${connection.name} · ${connection.brokers.join(', ')}`}
      >
        Publish <DotArrowRight width={20} height={20} strokeWidth={1.5} />
      </button>
    </>
  );

  return (
    <WorkbenchShell
      connection={connection}
      connectionDialogOpen={connectionDialogOpen}
      mode={mode}
      onModeChange={setMode}
      onConnectionToggle={onConnectionToggle}
      action={
        mode === 'compose' ? (
          composeAction
        ) : (
          <span className="fixture-status">
            <CheckCircle width={16} height={16} /> Previous run complete
          </span>
        )
      }
      workspace={
        mode === 'compose' ? (
          <ComposePanel
            connection={connection}
            draft={draft}
            setDraft={setDraft}
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
        ) : (
          <FlowPanel
            events={previousRun.events}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
          />
        )
      }
      previousRun={
        <PreviousRunPanel
          run={previousRun}
          selectedEventId={selectedEventId}
          selectedEvent={selectedEvent}
          onSelectEvent={setSelectedEventId}
        />
      }
    />
  );
}
