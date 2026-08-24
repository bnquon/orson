import type { api } from '../../../wailsjs/go/models';
import type { LoadedScenario, ScenarioDraft, ScenarioWarning } from './types';

const defaultPublishHeader = {
  id: 'header-content-type',
  name: 'content-type',
  value: 'application/json',
  protected: false,
};

function toDraft(data: api.ScenarioData): ScenarioDraft {
  return {
    rootTopic: data.publishTopic,
    watchedTopics: data.watchedTopics.map((name, index) => ({
      id: `topic-${index}`,
      name,
    })),
    topology: data.topology.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
    })),
    messageKey: '',
    headers: [{ ...defaultPublishHeader }],
    payload: data.publishPayload,
    captureTimeoutSeconds: String(data.captureTimeoutSeconds),
  };
}

function toWarning(warning: api.ScenarioWarning, sourceFilename: string): ScenarioWarning {
  return {
    code: warning.code,
    message: warning.message,
    sourceFilename: warning.sourceFilename || sourceFilename,
    line: warning.line ?? 0,
    column: warning.column ?? 0,
  };
}

export function toLoadedScenario(data: api.ScenarioData): LoadedScenario {
  const sourceFilename = data.sourceFilename || 'scenarios/order-flow.yaml';
  return {
    name: data.name,
    sourceFilename,
    correlationHeader: data.correlationHeader,
    draft: toDraft(data),
    warnings: (data.warnings ?? []).map((warning) => toWarning(warning, sourceFilename)),
  };
}
