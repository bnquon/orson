import { describe, expect, it } from 'vitest';
import { createUnsavedScenario } from '../scenarioFactory';

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
});
