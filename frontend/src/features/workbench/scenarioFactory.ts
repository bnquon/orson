import type { ScenarioDraft } from './types';

let fallbackRowId = 0;

function generatedRowId(prefix: string): string {
  if (globalThis.crypto?.randomUUID !== undefined) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  fallbackRowId += 1;
  return `${prefix}-unsaved-${fallbackRowId}`;
}

export function createUnsavedScenarioId(): string {
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
