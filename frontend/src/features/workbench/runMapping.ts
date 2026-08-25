import { api } from '../../../wailsjs/go/models';
import type { ScenarioDraft } from './types';

export function toRunRequest(draft: ScenarioDraft): api.RunRequest {
  return new api.RunRequest({
    rootTopic: draft.rootTopic.trim(),
    messageKey: draft.messageKey,
    payload: draft.payload,
    headers: draft.headers.map((header) => ({
      key: header.name.trim(),
      value: header.value,
    })),
    correlationHeader: draft.correlationHeader,
    watchedTopics: draft.watchedTopics.map((topic) => topic.name.trim()),
    captureTimeoutSeconds: Number(draft.captureTimeoutSeconds),
  });
}
