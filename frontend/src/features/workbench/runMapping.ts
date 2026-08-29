import { api } from '../../../wailsjs/go/models';
import type { ScenarioDraft, ScenarioSource } from './types';

export interface RunScenarioSnapshotInput {
  source: ScenarioSource;
  scenarioId?: string;
  sourcePath?: string;
  displayName?: string;
  sourceFilename?: string;
}

export function toRunRequest(
  draft: ScenarioDraft,
  scenario?: RunScenarioSnapshotInput,
): api.RunRequest {
  const request = {
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
  };

  return new api.RunRequest({
    ...request,
    scenarioSnapshot:
      scenario === undefined
        ? undefined
        : new api.RunScenarioSnapshot({
            version: 1,
            source: scenario.source,
            ...(scenario.source === 'unsaved'
              ? {}
              : {
                  scenarioId: scenario.scenarioId,
                  sourcePath: scenario.sourcePath,
                  sourceFilename: scenario.sourceFilename,
                }),
            displayName: draft.name.trim() || scenario.displayName,
            rootTopic: draft.rootTopic,
            watchedTopics: draft.watchedTopics.map((topic) => topic.name),
            topology: draft.configuredTopology,
            configuredTopology: draft.configuredTopology,
            messageKey: draft.messageKey,
            headers: draft.headers.map((header) => ({ key: header.name, value: header.value })),
            correlationHeader: draft.correlationHeader,
            payload: draft.payload,
            captureTimeoutSeconds: Number(draft.captureTimeoutSeconds),
          }),
  });
}
