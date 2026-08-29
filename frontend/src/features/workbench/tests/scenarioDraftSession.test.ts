import { describe, expect, it, vi } from 'vitest';
import {
  createScenarioDraftSession,
  runScenarioDraftSave,
  scenarioDraftSessionReducer,
} from '../scenarioDraftSession';
import type { LoadedScenario, ScenarioDraft } from '../types';

function draft(payload: string): ScenarioDraft {
  return {
    name: 'test scenario',
    rootTopic: 'orders',
    watchedTopics: [{ id: 'topic-0', name: 'payments' }],
    topology: [],
    configuredTopology: [],
    messageKey: '',
    headers: [],
    correlationHeader: 'x-correlation-id',
    payload,
    captureTimeoutSeconds: '10',
  };
}

function scenario(id: string, payload: string): LoadedScenario {
  return {
    id,
    relativePath: `${id}.yaml`,
    folderPath: '',
    name: id,
    sourceFilename: `${id}.yaml`,
    source: 'local',
    sourcePath: `/tmp/${id}.yaml`,
    localStatus: 'available',
    draft: draft(payload),
    warnings: [],
  };
}

describe('scenarioDraftSessionReducer', () => {
  it('keeps dirty interaction state in the frontend while retaining the backend scenario ID', () => {
    const loaded = scenario('local:backend-opaque-id', '{}');
    const state = scenarioDraftSessionReducer(createScenarioDraftSession(loaded), {
      type: 'draft_changed',
      update: (current) => ({ ...current, payload: '{"edited":true}' }),
    });

    expect(state.scenario.id).toBe('local:backend-opaque-id');
    expect(state.scenario.sourcePath).toBe('/tmp/local:backend-opaque-id.yaml');
    expect(state.draft.payload).toBe('{"edited":true}');
    expect(state.savedDraft).toBe(loaded.draft);
  });

  it('adopts the canonical saved draft after a successful save', () => {
    const original = scenario('local:one', '{}');
    const submitted = draft('{"edited":true}');
    let state = scenarioDraftSessionReducer(createScenarioDraftSession(original), {
      type: 'draft_changed',
      update: submitted,
    });
    state = scenarioDraftSessionReducer(state, { type: 'save_started', submittedDraft: submitted });
    state = scenarioDraftSessionReducer(state, {
      type: 'scenario_received',
      scenario: scenario('local:one', '{\n  "edited": true\n}'),
    });

    expect(state.draft.payload).toBe('{\n  "edited": true\n}');
    expect(state.savedDraft).toEqual(state.draft);
    expect(state.pendingSave).toBeNull();
  });

  it('keeps edits made while a save is in progress and advances only the saved baseline', () => {
    const original = scenario('local:one', '{}');
    const submitted = draft('{"version":1}');
    const newer = draft('{"version":2}');
    let state = scenarioDraftSessionReducer(createScenarioDraftSession(original), {
      type: 'draft_changed',
      update: submitted,
    });
    state = scenarioDraftSessionReducer(state, { type: 'save_started', submittedDraft: submitted });
    state = scenarioDraftSessionReducer(state, { type: 'draft_changed', update: newer });
    state = scenarioDraftSessionReducer(state, {
      type: 'scenario_received',
      scenario: scenario('local:one', '{\n  "version": 1\n}'),
    });

    expect(state.draft).toBe(newer);
    expect(state.savedDraft.payload).toBe('{\n  "version": 1\n}');
    expect(state.pendingSave).toBeNull();
  });

  it('keeps a failed save dirty', () => {
    const original = scenario('local:one', '{}');
    const edited = draft('{"edited":true}');
    let state = scenarioDraftSessionReducer(createScenarioDraftSession(original), {
      type: 'draft_changed',
      update: edited,
    });
    state = scenarioDraftSessionReducer(state, { type: 'save_started', submittedDraft: edited });
    state = scenarioDraftSessionReducer(state, { type: 'save_failed' });

    expect(state.draft).toBe(edited);
    expect(state.savedDraft).toBe(original.draft);
    expect(state.pendingSave).toBeNull();
  });

  it('activates a successful Save as result under its backend-issued ID and source path', () => {
    const original = scenario('example.yaml', '{}');
    original.source = 'example';
    original.sourcePath = '';
    let state = createScenarioDraftSession(original);
    state = scenarioDraftSessionReducer(state, {
      type: 'save_started',
      submittedDraft: state.draft,
    });
    state = scenarioDraftSessionReducer(state, {
      type: 'scenario_received',
      scenario: scenario('local:new-backend-id', '{\n}'),
    });

    expect(state.scenario.id).toBe('local:new-backend-id');
    expect(state.scenario.sourcePath).toBe('/tmp/local:new-backend-id.yaml');
    expect(state.draft).toBe(state.scenario.draft);
  });

  it('marks the submitted baseline and clears pending save state only after failure', async () => {
    const submittedDraft = draft('{"edited":true}');
    const markSaveStarted = vi.fn();
    const markSaveFailed = vi.fn();

    expect(
      await runScenarioDraftSave({
        submittedDraft,
        markSaveStarted,
        save: () => Promise.resolve('failed'),
        markSaveFailed,
      }),
    ).toBe('failed');
    expect(markSaveStarted).toHaveBeenCalledWith(submittedDraft);
    expect(markSaveFailed).toHaveBeenCalledOnce();

    markSaveFailed.mockClear();
    await runScenarioDraftSave({
      submittedDraft,
      markSaveStarted,
      save: () => Promise.resolve('succeeded'),
      markSaveFailed,
    });
    expect(markSaveFailed).not.toHaveBeenCalled();
  });
});
