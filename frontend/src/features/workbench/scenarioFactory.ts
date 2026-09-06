import type { LoadedScenario, ScenarioDraft } from './types';

let fallbackRowId = 0;

function generatedRowId(prefix: string): string {
  if (globalThis.crypto?.randomUUID !== undefined) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  fallbackRowId += 1;
  return `${prefix}-unsaved-${fallbackRowId}`;
}

function createUnsavedScenarioId(): string {
  return generatedRowId('scenario');
}

export function createUnsavedScenario(): ScenarioDraft {
  return {
    name: 'Untitled scenario',
    rootTopic: '',
    watchedTopics: [],
    topology: [],
    configuredTopology: [],
    messageKey: '',
    headers: [
      {
        id: generatedRowId('header'),
        name: 'content-type',
        value: 'application/json',
        protected: false,
      },
    ],
    correlationHeader: 'x-correlation-id',
    payload: '{}',
    captureTimeoutSeconds: '10',
  };
}

export function createUnsavedLoadedScenario(draft: ScenarioDraft): LoadedScenario {
  return {
    id: createUnsavedScenarioId(),
    relativePath: '',
    folderPath: '',
    name: draft.name,
    sourceFilename: '',
    source: 'unsaved',
    sourcePath: '',
    localStatus: null,
    draft: {
      ...draft,
      watchedTopics: draft.watchedTopics.map((topic) => ({ ...topic })),
      topology: draft.topology.map((edge) => ({ ...edge })),
      configuredTopology: draft.configuredTopology.map((edge) => ({ ...edge })),
      headers: draft.headers.map((header) => ({ ...header })),
    },
    warnings: [],
  };
}
