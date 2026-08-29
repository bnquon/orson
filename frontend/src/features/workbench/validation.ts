import type { KafkaConnection, ScenarioDraft, ValidatableField, ValidationResult } from './types';
import { hasActiveTopologyCycle } from './topologyValidation';

export function getJsonError(payload: string): string | null {
  if (payload.trim().length === 0) {
    return 'Enter a JSON payload.';
  }

  try {
    JSON.parse(payload);
    return null;
  } catch {
    return 'Payload must contain valid JSON.';
  }
}

export function validateScenario(
  draft: ScenarioDraft,
  connection: KafkaConnection,
  payloadError: string | null = getJsonError(draft.payload),
): ValidationResult {
  return validateScenarioFields(draft, payloadError, connection.status === 'connected');
}

export function validateScenarioDraft(
  draft: ScenarioDraft,
  payloadError: string | null = getJsonError(draft.payload),
): ValidationResult {
  const result = validateScenarioFields(draft, payloadError, true);
  if (!hasActiveTopologyCycle(draft)) return result;

  return {
    ...result,
    fieldErrors: {
      ...result.fieldErrors,
      watchedTopics:
        'The configured topology contains a cycle. Remove the watched topic that activates it.',
    },
    issueCount: result.issueCount + (result.fieldErrors.watchedTopics === undefined ? 1 : 0),
    firstInvalidControlId: result.firstInvalidControlId ?? 'compose-add-watched-topic',
  };
}

function validateScenarioFields(
  draft: ScenarioDraft,
  payloadError: string | null,
  connectionAvailable: boolean,
): ValidationResult {
  const fieldErrors: Partial<Record<ValidatableField, string>> = {};
  const watchedTopicErrors: Record<string, string> = {};
  const headerErrors: Record<string, string> = {};

  if (!connectionAvailable) {
    fieldErrors.connection = 'Connect the active workspace before publishing.';
  }

  if (draft.name.trim().length === 0) {
    fieldErrors.name = 'Enter a scenario name.';
  }

  const rootTopic = draft.rootTopic.trim();
  if (rootTopic.length === 0) {
    fieldErrors.rootTopic = 'Enter the root topic to publish to.';
  }

  if (draft.watchedTopics.length === 0) {
    fieldErrors.watchedTopics = 'Add at least one downstream topic to observe.';
  }

  const topicCounts = new Map<string, number>();
  for (const topic of draft.watchedTopics) {
    const name = topic.name.trim();
    topicCounts.set(name, (topicCounts.get(name) ?? 0) + 1);
  }

  for (const topic of draft.watchedTopics) {
    const name = topic.name.trim();
    if (name.length === 0) {
      watchedTopicErrors[topic.id] = 'Enter a downstream topic.';
    } else if (name === rootTopic) {
      watchedTopicErrors[topic.id] = 'The root event is included automatically.';
    } else if ((topicCounts.get(name) ?? 0) > 1) {
      watchedTopicErrors[topic.id] = 'Each watched topic must be unique.';
    }
  }

  for (const header of draft.headers) {
    if (!header.protected && header.name.trim().length === 0) {
      headerErrors[header.id] = 'Enter a header name.';
    } else if (
      !header.protected &&
      header.name.trim().toLowerCase() === draft.correlationHeader.trim().toLowerCase()
    ) {
      headerErrors[header.id] =
        'Orson manages this header automatically. Remove it from Custom headers.';
    }
  }

  if (payloadError !== null) {
    fieldErrors.payload = payloadError;
  }

  const timeout = Number(draft.captureTimeoutSeconds);
  if (
    draft.captureTimeoutSeconds.trim().length === 0 ||
    !Number.isInteger(timeout) ||
    timeout < 1 ||
    timeout > 300
  ) {
    fieldErrors.captureTimeoutSeconds = 'Use a whole number from 1 to 300.';
  }

  const fieldOrder: Array<Readonly<[ValidatableField, string]>> = [
    ['connection', 'compose-connection'],
    ['name', 'compose-scenario-name'],
    ['rootTopic', 'compose-root-topic'],
    ['captureTimeoutSeconds', 'compose-timeout'],
    ['watchedTopics', 'compose-add-watched-topic'],
    ['headers', 'compose-add-header'],
    ['payload', 'compose-payload'],
  ];

  let firstInvalidControlId: string | null = null;
  for (const [field, controlId] of fieldOrder) {
    if (field === 'watchedTopics') {
      const firstTopicId = draft.watchedTopics.find((topic) => watchedTopicErrors[topic.id])?.id;
      if (firstTopicId !== undefined) {
        firstInvalidControlId = `watched-topic-${firstTopicId}`;
        break;
      }
    }

    if (field === 'headers') {
      const firstHeaderId = draft.headers.find((header) => headerErrors[header.id])?.id;
      if (firstHeaderId !== undefined) {
        firstInvalidControlId = `header-name-${firstHeaderId}`;
        break;
      }
    }

    if (fieldErrors[field] !== undefined) {
      firstInvalidControlId = controlId;
      break;
    }
  }

  const issueCount =
    Object.keys(fieldErrors).length +
    Object.keys(watchedTopicErrors).length +
    Object.keys(headerErrors).length;

  return {
    fieldErrors,
    watchedTopicErrors,
    headerErrors,
    issueCount,
    firstInvalidControlId,
  };
}
