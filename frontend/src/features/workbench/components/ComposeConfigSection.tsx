import { useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { Clock, Key, Plus, Trash, WarningCircle } from 'iconoir-react';
import type {
  KafkaConnection,
  ScenarioDraft,
  TouchedState,
  ValidatableField,
  ValidationResult,
} from '../types';
import { removeTopologyTopic, renameTopologyTopic } from '../draftEditing';
import { focusControl } from './focusControl';

interface ComposeConfigSectionProps {
  connection: KafkaConnection;
  draft: ScenarioDraft;
  setDraft: Dispatch<SetStateAction<ScenarioDraft>>;
  rootTopicEditRef: RefObject<string | null>;
  touched: TouchedState;
  validation: ValidationResult;
  onReviewConnection: () => void;
  onTouchField: (field: ValidatableField) => void;
  onTouchWatchedTopic: (topicId: string) => void;
}

export function ComposeConfigSection({
  connection,
  draft,
  setDraft,
  rootTopicEditRef,
  touched,
  validation,
  onReviewConnection,
  onTouchField,
  onTouchWatchedTopic,
}: ComposeConfigSectionProps) {
  const watchedTopicEditRefs = useRef(new Map<string, string>());
  const touchedWatchedTopicIds = new Set(touched.watchedTopicIds);
  const showFieldError = (field: ValidatableField) => touched.fields[field] === true;

  const beginRootTopicEdit = () => {
    if (rootTopicEditRef.current === null) rootTopicEditRef.current = draft.rootTopic;
  };

  const commitRootTopicEdit = (nextName: string) => {
    const previousName = rootTopicEditRef.current;
    if (previousName === null) return;
    if (previousName.trim() === nextName.trim()) {
      rootTopicEditRef.current = null;
      return;
    }
    const normalizedNextName = nextName.trim();
    if (
      normalizedNextName === '' ||
      draft.watchedTopics.some((topic) => topic.name.trim() === normalizedNextName)
    ) {
      return;
    }

    rootTopicEditRef.current = null;
    setDraft((current) => ({
      ...current,
      topology: renameTopologyTopic(current.topology, previousName, nextName),
      configuredTopology: renameTopologyTopic(current.configuredTopology, previousName, nextName),
    }));
  };

  const beginWatchedTopicEdit = (topicId: string, topicName: string) => {
    if (!watchedTopicEditRefs.current.has(topicId)) {
      watchedTopicEditRefs.current.set(topicId, topicName);
    }
  };

  const commitWatchedTopicEdit = (topicId: string, nextName: string) => {
    const previousName = watchedTopicEditRefs.current.get(topicId);
    if (previousName === undefined) return;
    if (previousName.trim() === nextName.trim()) {
      watchedTopicEditRefs.current.delete(topicId);
      return;
    }
    const normalizedNextName = nextName.trim();
    if (
      normalizedNextName === '' ||
      normalizedNextName === draft.rootTopic.trim() ||
      draft.watchedTopics.some(
        (topic) => topic.id !== topicId && topic.name.trim() === normalizedNextName,
      )
    ) {
      return;
    }

    watchedTopicEditRefs.current.delete(topicId);
    setDraft((current) => ({
      ...current,
      topology: renameTopologyTopic(current.topology, previousName, nextName),
      configuredTopology: renameTopologyTopic(current.configuredTopology, previousName, nextName),
    }));
  };

  const addWatchedTopic = () => {
    const id = crypto.randomUUID();
    setDraft((current) => ({
      ...current,
      watchedTopics: [...current.watchedTopics, { id, name: '' }],
    }));
    focusControl(`watched-topic-${id}`);
  };

  const removeWatchedTopic = (topicId: string) => {
    const removedTopic = draft.watchedTopics.find((topic) => topic.id === topicId);
    const index = draft.watchedTopics.findIndex((topic) => topic.id === topicId);
    const remaining = draft.watchedTopics.filter((topic) => topic.id !== topicId);
    const nextTopic = remaining[Math.min(index, remaining.length - 1)];
    watchedTopicEditRefs.current.delete(topicId);
    setDraft((current) => ({
      ...current,
      watchedTopics: remaining,
      topology:
        removedTopic === undefined
          ? current.topology
          : removeTopologyTopic(current.topology, removedTopic.name),
      configuredTopology:
        removedTopic === undefined
          ? current.configuredTopology
          : removeTopologyTopic(current.configuredTopology, removedTopic.name),
    }));
    focusControl(
      nextTopic === undefined ? 'compose-add-watched-topic' : `watched-topic-${nextTopic.id}`,
    );
  };

  return (
    <div className="compose-config workbench-scroll-region">
      {connection.status !== 'connected' ? (
        <div
          className="compose-connection-warning"
          id="compose-connection"
          role="status"
          tabIndex={-1}
          aria-describedby="compose-connection-error"
        >
          <WarningCircle width={16} height={16} />
          <span id="compose-connection-error">
            {validation.fieldErrors.connection ?? 'The active workspace connection is unavailable.'}
          </span>
          {/* Defensive fallback: the app normally gates the workbench until this is connected. */}
          <button type="button" onClick={onReviewConnection}>
            Review connection
          </button>
        </div>
      ) : null}

      <div className="compose-fields">
        <label className="compose-field compose-field--root">
          <span className="compose-label">
            Root topic <span aria-hidden="true">*</span>
          </span>
          <input
            id="compose-root-topic"
            className={
              showFieldError('rootTopic') && validation.fieldErrors.rootTopic !== undefined
                ? 'compose-control--invalid'
                : ''
            }
            value={draft.rootTopic}
            onFocus={beginRootTopicEdit}
            onChange={(event) =>
              setDraft((current) => ({ ...current, rootTopic: event.target.value }))
            }
            onBlur={(event) => {
              commitRootTopicEdit(event.currentTarget.value);
              onTouchField('rootTopic');
            }}
            aria-invalid={
              showFieldError('rootTopic') && validation.fieldErrors.rootTopic !== undefined
            }
            aria-describedby="compose-root-topic-help compose-root-topic-error"
            autoComplete="off"
          />
          <span className="compose-help" id="compose-root-topic-help">
            Published once and included automatically in the run.
          </span>
          <span className="compose-error-slot" id="compose-root-topic-error">
            {showFieldError('rootTopic') ? validation.fieldErrors.rootTopic : null}
          </span>
        </label>

        <label className="compose-field">
          <span className="compose-label">
            <Key /> Message key <span className="compose-optional">Optional</span>
          </span>
          <input
            value={draft.messageKey}
            onChange={(event) =>
              setDraft((current) => ({ ...current, messageKey: event.target.value }))
            }
            autoComplete="off"
          />
        </label>

        <label className="compose-field compose-field--timeout">
          <span className="compose-label">
            <Clock /> Capture timeout
          </span>
          <span
            className={`compose-timeout-control ${showFieldError('captureTimeoutSeconds') && validation.fieldErrors.captureTimeoutSeconds !== undefined ? 'compose-control--invalid' : ''}`}
          >
            <input
              id="compose-timeout"
              inputMode="numeric"
              value={draft.captureTimeoutSeconds}
              onChange={(event) =>
                setDraft((current) => ({ ...current, captureTimeoutSeconds: event.target.value }))
              }
              onBlur={() => onTouchField('captureTimeoutSeconds')}
              aria-invalid={
                showFieldError('captureTimeoutSeconds') &&
                validation.fieldErrors.captureTimeoutSeconds !== undefined
              }
              aria-describedby="compose-timeout-error"
            />
            <span>seconds</span>
          </span>
          <span className="compose-error-slot" id="compose-timeout-error">
            {showFieldError('captureTimeoutSeconds')
              ? validation.fieldErrors.captureTimeoutSeconds
              : null}
          </span>
        </label>
      </div>

      <section className="watched-topics" aria-labelledby="watched-topics-label">
        <div className="watched-topics__heading">
          <div>
            <span className="compose-label" id="watched-topics-label">
              Watched topics <span aria-hidden="true">*</span>
            </span>
            <span className="compose-help">
              Downstream topics only. The root topic is already included.
            </span>
          </div>
          <button
            className="compose-secondary-button"
            id="compose-add-watched-topic"
            type="button"
            onClick={addWatchedTopic}
          >
            <Plus /> Add topic
          </button>
        </div>
        <div className="watched-topics__list">
          {draft.watchedTopics.map((topic) => {
            const showError = touchedWatchedTopicIds.has(topic.id);
            const error = validation.watchedTopicErrors[topic.id];
            return (
              <div className="watched-topic-row" key={topic.id}>
                <div className="watched-topic-row__control">
                  <input
                    id={`watched-topic-${topic.id}`}
                    className={showError && error !== undefined ? 'compose-control--invalid' : ''}
                    value={topic.name}
                    onFocus={() => beginWatchedTopicEdit(topic.id, topic.name)}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        watchedTopics: current.watchedTopics.map((item) =>
                          item.id === topic.id ? { ...item, name: event.target.value } : item,
                        ),
                      }))
                    }
                    onBlur={(event) => {
                      commitWatchedTopicEdit(topic.id, event.currentTarget.value);
                      onTouchWatchedTopic(topic.id);
                    }}
                    aria-label="Watched downstream topic"
                    aria-invalid={showError && error !== undefined}
                    aria-describedby={`watched-topic-error-${topic.id}`}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${topic.name || 'watched topic'}`}
                    title="Remove topic"
                    onClick={() => removeWatchedTopic(topic.id)}
                  >
                    <Trash width={16} height={16} />
                  </button>
                </div>
                <span className="compose-error-slot" id={`watched-topic-error-${topic.id}`}>
                  {showError ? error : null}
                </span>
              </div>
            );
          })}
        </div>
        <span className="compose-error-slot">
          {showFieldError('watchedTopics') ? validation.fieldErrors.watchedTopics : null}
        </span>
      </section>
    </div>
  );
}
