import type { api } from '../../../wailsjs/go/models';
import type {
  LoadedScenario,
  ScenarioDescriptor,
  ScenarioDiagnostic,
  ScenarioDraft,
  ScenarioWarning,
} from './types';

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

function toDiagnostic(
  diagnostic: api.ScenarioDiagnostic,
  sourceFilename: string,
): ScenarioDiagnostic {
  return {
    code: diagnostic.code,
    path: diagnostic.path ?? '',
    message: diagnostic.message,
    details: diagnostic.details ?? '',
    sourceFilename: diagnostic.sourceFilename || sourceFilename,
    line: diagnostic.line ?? 0,
    column: diagnostic.column ?? 0,
  };
}

export function toScenarioDescriptor(data: api.ScenarioDescriptor): ScenarioDescriptor {
  const sourceFilename = data.sourceFilename || data.relativePath;
  return {
    id: data.id,
    displayName: data.displayName || data.relativePath,
    relativePath: data.relativePath,
    folderPath: data.folderPath ?? '',
    sourceFilename,
    status: data.status as ScenarioDescriptor['status'],
    warnings: (data.warnings ?? []).map((warning) => toWarning(warning, sourceFilename)),
    diagnostics: (data.diagnostics ?? []).map((diagnostic) =>
      toDiagnostic(diagnostic, sourceFilename),
    ),
  };
}

export function toLoadedScenario(data: api.ScenarioData): LoadedScenario {
  const sourceFilename = data.sourceFilename || data.relativePath || 'order-flow.yaml';
  const id = data.id || data.relativePath || sourceFilename;
  return {
    id,
    relativePath: data.relativePath || sourceFilename,
    folderPath: data.folderPath ?? '',
    name: data.name,
    sourceFilename,
    correlationHeader: data.correlationHeader,
    draft: toDraft(data),
    warnings: (data.warnings ?? []).map((warning) => toWarning(warning, sourceFilename)),
  };
}
