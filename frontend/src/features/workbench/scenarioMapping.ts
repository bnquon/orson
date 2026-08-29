import type { api } from '../../../wailsjs/go/models';
import type {
  LoadedScenario,
  ScenarioDescriptor,
  ScenarioDiagnostic,
  ScenarioDraft,
  ScenarioWarning,
} from './types';

interface ScenarioHeaderData {
  key: string;
  value: string;
}

export interface ScenarioDraftData {
  name: string;
  publishTopic: string;
  publishPayload: string;
  messageKey: string;
  headers: ScenarioHeaderData[];
  watchedTopics: string[];
  correlationHeader: string;
  captureTimeoutSeconds: number;
  topology: Array<{ id: string; from: string; to: string }>;
}

const defaultPublishHeader = {
  id: 'header-content-type',
  name: 'content-type',
  value: 'application/json',
  protected: false,
};

function toDraft(data: api.ScenarioData): ScenarioDraft {
  const headers = data.headers;
  return {
    name: data.name,
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
    configuredTopology: (data.configuredTopology ?? data.topology).map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
    })),
    messageKey: data.messageKey ?? '',
    headers:
      headers === undefined
        ? [{ ...defaultPublishHeader }]
        : headers.map((header, index) => ({
            id: `header-${index}`,
            name: header.key,
            value: header.value,
            protected: false,
          })),
    correlationHeader: data.correlationHeader,
    payload: data.publishPayload,
    captureTimeoutSeconds: String(data.captureTimeoutSeconds),
  };
}

function toSourceMetadata(data: {
  source?: string;
  sourcePath?: string;
  localStatus?: string;
}): Pick<LoadedScenario, 'source' | 'sourcePath' | 'localStatus'> {
  const source =
    data.source === 'local' ? 'local' : data.source === 'unsaved' ? 'unsaved' : 'example';
  const localStatus =
    data.localStatus === 'changed' ||
    data.localStatus === 'missing' ||
    data.localStatus === 'unreadable'
      ? data.localStatus
      : source === 'local'
        ? 'available'
        : null;

  return { source, sourcePath: data.sourcePath ?? '', localStatus };
}

function toWarning(warning: api.ScenarioWarning, sourceFilename: string): ScenarioWarning {
  return {
    code: warning.code,
    path: warning.path ?? '',
    message: warning.message,
    sourceFilename: warning.sourceFilename || sourceFilename,
    line: warning.line ?? 0,
    column: warning.column ?? 0,
  };
}

export function toScenarioDiagnostic(
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
    ...toSourceMetadata(data),
    status: data.status as ScenarioDescriptor['status'],
    warnings: (data.warnings ?? []).map((warning) => toWarning(warning, sourceFilename)),
    diagnostics: (data.diagnostics ?? []).map((diagnostic) =>
      toScenarioDiagnostic(diagnostic, sourceFilename),
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
    ...toSourceMetadata(data),
    draft: toDraft(data),
    warnings: (data.warnings ?? []).map((warning) => toWarning(warning, sourceFilename)),
  };
}

export function toScenarioDraftData(draft: ScenarioDraft): ScenarioDraftData {
  return {
    name: draft.name.trim(),
    publishTopic: draft.rootTopic,
    publishPayload: draft.payload,
    messageKey: draft.messageKey,
    headers: draft.headers.map((header) => ({ key: header.name, value: header.value })),
    watchedTopics: draft.watchedTopics.map((topic) => topic.name),
    correlationHeader: draft.correlationHeader,
    captureTimeoutSeconds: Number(draft.captureTimeoutSeconds),
    topology: draft.configuredTopology.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
    })),
  };
}
