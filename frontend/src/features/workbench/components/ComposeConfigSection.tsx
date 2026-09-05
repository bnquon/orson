import { useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { Clock, Key, Plus, Trash, WarningCircle, Xmark } from 'iconoir-react';
import type {
  KafkaConnection,
  ScenarioDraft,
  TouchedState,
  ValidatableField,
  ValidationResult,
} from '../types';
import {
  addTopologyEdge,
  removeTopologyEdge,
  removeWatchedTopic as removeWatchedTopicFromDraft,
  renameWatchedTopic,
  setRootTopic,
} from '../draftEditing';
import { focusControl } from './focusControl';
import { TopologySourcePicker } from './TopologySourcePicker';

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
  const [topologyFeedback, setTopologyFeedback] = useState<{
    draft: ScenarioDraft;
    message: string;
    topicId: string;
  } | null>(null);
  const [renameFeedback, setRenameFeedback] = useState<{
    draft: ScenarioDraft;
    message: string;
    topicId: string | null;
  } | null>(null);
  const rootRenameError =
    renameFeedback?.draft === draft && renameFeedback.topicId === null
      ? renameFeedback.message
      : undefined;
  const touchedWatchedTopicIds = new Set(touched.watchedTopicIds);
  const showFieldError = (field: ValidatableField) => touched.fields[field] === true;

  const clearTopologyFeedback = (topicId: string) => {
    setTopologyFeedback((current) => (current?.topicId === topicId ? null : current));
  };

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
    const result = setRootTopic(draft, nextName, previousName);
    if (!result.ok) {
      const restoredDraft = { ...draft, rootTopic: previousName };
      rootTopicEditRef.current = null;
      setDraft(restoredDraft);
      setRenameFeedback({ draft: restoredDraft, message: result.error.message, topicId: null });
      return;
    }

    setRenameFeedback(null);

    rootTopicEditRef.current = null;
    setDraft(result.draft);
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
    const result = renameWatchedTopic(draft, topicId, nextName, previousName);
    if (!result.ok) {
      const restoredDraft = {
        ...draft,
        watchedTopics: draft.watchedTopics.map((topic) =>
          topic.id === topicId ? { ...topic, name: previousName } : topic,
        ),
      };
      watchedTopicEditRefs.current.delete(topicId);
      setDraft(restoredDraft);
      setRenameFeedback({ draft: restoredDraft, message: result.error.message, topicId });
      return;
    }

    setRenameFeedback(null);

    watchedTopicEditRefs.current.delete(topicId);
    clearTopologyFeedback(topicId);
    setDraft(result.draft);
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
    const index = draft.watchedTopics.findIndex((topic) => topic.id === topicId);
    const remaining = draft.watchedTopics.filter((topic) => topic.id !== topicId);
    const nextTopic = remaining[Math.min(index, remaining.length - 1)];
    const result = removeWatchedTopicFromDraft(draft, topicId);
    if (!result.ok) return;

    watchedTopicEditRefs.current.delete(topicId);
    clearTopologyFeedback(topicId);
    setDraft(result.draft);
    focusControl(
      nextTopic === undefined ? 'compose-add-watched-topic' : `watched-topic-${nextTopic.id}`,
    );
  };

  const addWatchedTopicSource = (topicId: string, sourceName: string) => {
    const topic = draft.watchedTopics.find((item) => item.id === topicId);
    if (topic === undefined) return;

    const result = addTopologyEdge(draft, { from: sourceName, to: topic.name });
    if (!result.ok) {
      setTopologyFeedback({ draft, message: result.error.message, topicId });
      return;
    }

    clearTopologyFeedback(topicId);
    setDraft(result.draft);
  };

  const removeWatchedTopicSource = (topicId: string, sourceName: string, targetName: string) => {
    const result = removeTopologyEdge(draft, { from: sourceName, to: targetName });
    if (!result.ok) {
      setTopologyFeedback({ draft, message: result.error.message, topicId });
      return;
    }

    clearTopologyFeedback(topicId);
    setDraft(result.draft);
  };

  const topologySources = (topicId: string, connectedSources: ReadonlySet<string>) => {
    const sources = [
      ...(draft.rootTopic.trim() === ''
        ? []
        : [{ value: draft.rootTopic.trim(), label: `${draft.rootTopic.trim()} (root)` }]),
      ...draft.watchedTopics
        .filter((item) => item.id !== topicId && item.name.trim() !== '')
        .map((item) => ({ value: item.name.trim(), label: `${item.name.trim()} (source)` })),
    ];
    return sources.filter(
      (source, index) =>
        !connectedSources.has(source.value) &&
        sources.findIndex((candidate) => candidate.value === source.value) === index,
    );
  };

  const topologySourceLabel = (sourceName: string) =>
    sourceName === draft.rootTopic.trim() ? `${sourceName} (root)` : `${sourceName} (source)`;

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
        <label className="compose-field compose-field--name">
          <span className="compose-label">
            Scenario name <span aria-hidden="true">*</span>
          </span>
          <input
            id="compose-scenario-name"
            className={
              showFieldError('name') && validation.fieldErrors.name !== undefined
                ? 'compose-control--invalid'
                : ''
            }
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            onBlur={() => onTouchField('name')}
            aria-invalid={showFieldError('name') && validation.fieldErrors.name !== undefined}
            aria-describedby="compose-scenario-name-error"
            autoComplete="off"
          />
          <span className="compose-error-slot" id="compose-scenario-name-error">
            {showFieldError('name') ? validation.fieldErrors.name : null}
          </span>
        </label>
        <label className="compose-field compose-field--root">
          <span className="compose-label">
            Root topic <span aria-hidden="true">*</span>
          </span>
          <input
            id="compose-root-topic"
            className={
              rootRenameError !== undefined ||
              (showFieldError('rootTopic') && validation.fieldErrors.rootTopic !== undefined)
                ? 'compose-control--invalid'
                : ''
            }
            value={draft.rootTopic}
            onFocus={beginRootTopicEdit}
            onChange={(event) => {
              setRenameFeedback(null);
              setDraft((current) => ({ ...current, rootTopic: event.target.value }));
            }}
            onBlur={(event) => {
              commitRootTopicEdit(event.currentTarget.value);
              onTouchField('rootTopic');
            }}
            aria-invalid={
              rootRenameError !== undefined ||
              (showFieldError('rootTopic') && validation.fieldErrors.rootTopic !== undefined)
            }
            aria-describedby="compose-root-topic-help compose-root-topic-error"
            autoComplete="off"
          />
          <span className="compose-help" id="compose-root-topic-help">
            Published once and included automatically in the run.
          </span>
          <span
            className="compose-error-slot"
            id="compose-root-topic-error"
            role={rootRenameError ? 'alert' : undefined}
          >
            {rootRenameError ??
              (showFieldError('rootTopic') ? validation.fieldErrors.rootTopic : null)}
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
            <span className="compose-help">
              Choose an upstream topic below to connect each one.
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
            const renameError =
              renameFeedback?.draft === draft && renameFeedback.topicId === topic.id
                ? renameFeedback.message
                : undefined;
            const error = validation.watchedTopicErrors[topic.id];
            const targetName = topic.name.trim();
            const incomingSources = draft.configuredTopology.filter(
              (edge) => targetName !== '' && edge.to.trim() === targetName,
            );
            const connectedSources = new Set(incomingSources.map((edge) => edge.from.trim()));
            const sourceFeedback =
              topologyFeedback?.draft === draft && topologyFeedback.topicId === topic.id
                ? topologyFeedback.message
                : undefined;
            return (
              <div className="watched-topic-row" key={topic.id}>
                <div className="watched-topic-row__control">
                  <div
                    className="watched-topic-row__sources"
                    aria-label={`Sources for ${topic.name || 'watched topic'}`}
                    aria-describedby={
                      sourceFeedback ? `watched-topic-error-${topic.id}` : undefined
                    }
                  >
                    {incomingSources.length === 0 ? (
                      <span className="watched-topic-row__not-connected">Not connected</span>
                    ) : (
                      incomingSources.map((edge, index) => {
                        const sourceName = edge.from.trim();
                        return (
                          <span
                            className="watched-topic-row__connection"
                            key={`${edge.id}:${index}`}
                          >
                            <span title={sourceName}>{topologySourceLabel(sourceName)}</span>
                            <button
                              type="button"
                              aria-label={`Remove ${sourceName} as a source for ${targetName || 'watched topic'}`}
                              title={`Remove source ${sourceName}`}
                              onClick={() =>
                                removeWatchedTopicSource(topic.id, sourceName, targetName)
                              }
                            >
                              <Xmark width={12} height={12} aria-hidden="true" />
                            </button>
                          </span>
                        );
                      })
                    )}
                    <TopologySourcePicker
                      topicLabel={topic.name || 'watched topic'}
                      options={topologySources(topic.id, connectedSources)}
                      onSelect={(sourceName) => addWatchedTopicSource(topic.id, sourceName)}
                    />
                  </div>
                  <input
                    id={`watched-topic-${topic.id}`}
                    className={
                      renameError !== undefined || (showError && error !== undefined)
                        ? 'compose-control--invalid'
                        : ''
                    }
                    value={topic.name}
                    onFocus={() => beginWatchedTopicEdit(topic.id, topic.name)}
                    onChange={(event) => {
                      clearTopologyFeedback(topic.id);
                      setRenameFeedback(null);
                      setDraft((current) => ({
                        ...current,
                        watchedTopics: current.watchedTopics.map((item) =>
                          item.id === topic.id ? { ...item, name: event.target.value } : item,
                        ),
                      }));
                    }}
                    onBlur={(event) => {
                      commitWatchedTopicEdit(topic.id, event.currentTarget.value);
                      onTouchWatchedTopic(topic.id);
                    }}
                    aria-label="Watched downstream topic"
                    aria-invalid={renameError !== undefined || (showError && error !== undefined)}
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
                <span
                  className="compose-error-slot"
                  id={`watched-topic-error-${topic.id}`}
                  role={renameError || sourceFeedback ? 'alert' : undefined}
                >
                  {renameError ?? sourceFeedback ?? (showError ? error : null)}
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
