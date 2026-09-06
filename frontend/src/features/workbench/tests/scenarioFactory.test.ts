import { describe, expect, it } from 'vitest';
import { createUnsavedLoadedScenario, createUnsavedScenario } from '../scenarioFactory';
import { initialScenario } from '../fixtures';

describe('createUnsavedScenario', () => {
  it('creates the invalid starter draft with stable editable row identity', () => {
    const draft = createUnsavedScenario();

    expect(draft).toMatchObject({
      name: 'Untitled scenario',
      rootTopic: '',
      watchedTopics: [],
      topology: [],
      configuredTopology: [],
      messageKey: '',
      correlationHeader: 'x-correlation-id',
      payload: '{}',
      captureTimeoutSeconds: '10',
    });
    expect(draft.headers).toHaveLength(1);
    expect(draft.headers[0]).toMatchObject({
      name: 'content-type',
      value: 'application/json',
      protected: false,
    });
    expect(draft.headers[0]?.id).toMatch(/^header-/);
    expect(createUnsavedScenario().headers[0]?.id).not.toBe(draft.headers[0]?.id);
  });

  it('detaches a loaded draft from its original scenario and file metadata', () => {
    const loaded = createUnsavedLoadedScenario(initialScenario);

    expect(loaded).toMatchObject({
      relativePath: '',
      folderPath: '',
      sourceFilename: '',
      source: 'unsaved',
      sourcePath: '',
      localStatus: null,
      draft: initialScenario,
      warnings: [],
    });
    expect(loaded.id).toMatch(/^scenario-/);
    expect(loaded.draft).not.toBe(initialScenario);
    expect(loaded.draft.watchedTopics).not.toBe(initialScenario.watchedTopics);
    expect(loaded.draft.topology).not.toBe(initialScenario.topology);
    expect(loaded.draft.configuredTopology).not.toBe(initialScenario.configuredTopology);
    expect(loaded.draft.headers).not.toBe(initialScenario.headers);

    loaded.draft.watchedTopics[0].name = 'changed.after.load';
    loaded.draft.headers[0].value = 'text/plain';
    expect(initialScenario.watchedTopics[0]?.name).toBe('payment.charged');
    expect(initialScenario.headers[0]?.value).toBe('application/json');
  });
});
