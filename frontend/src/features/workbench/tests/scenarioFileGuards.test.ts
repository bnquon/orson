import { describe, expect, it, vi } from 'vitest';
import {
  decideScenarioAction,
  executeScenarioAction,
  getScenarioFileBlocker,
  getScenarioFileDisabledReason,
  type ScenarioFileBlocker,
} from '../scenarioFileGuards';
import type { ScenarioDescriptor } from '../types';

function target(status: ScenarioDescriptor['status'] = 'valid'): ScenarioDescriptor {
  return {
    id: 'local:target',
    displayName: 'target',
    relativePath: 'target.yaml',
    folderPath: '',
    sourceFilename: 'target.yaml',
    source: 'local',
    sourcePath: '/tmp/target.yaml',
    localStatus: 'available',
    status,
    warnings: [],
    diagnostics: [],
  };
}

describe('scenario file workflow guards', () => {
  it('asks for confirmation before dirty imports and valid scenario switches', () => {
    const shared = {
      runActive: false,
      selectionLoading: false,
      draftDirty: true,
      currentScenarioId: 'local:current',
    };
    expect(decideScenarioAction({ ...shared, kind: 'import' })).toBe('confirm');
    expect(decideScenarioAction({ ...shared, kind: 'select', target: target() })).toBe('confirm');
  });

  it('opens the native import flow only after the confirmed pending action executes', () => {
    const importScenario = vi.fn();
    const selectScenario = vi.fn();

    executeScenarioAction({ kind: 'import' }, { importScenario, selectScenario });

    expect(importScenario).toHaveBeenCalledOnce();
    expect(selectScenario).not.toHaveBeenCalled();
  });

  it('does not discard a dirty draft merely to display invalid-file diagnostics', () => {
    expect(
      decideScenarioAction({
        kind: 'select',
        runActive: false,
        selectionLoading: false,
        draftDirty: true,
        currentScenarioId: 'local:current',
        target: target('invalid'),
      }),
    ).toBe('proceed');
  });

  it('blocks import and switching during an active run', () => {
    for (const kind of ['import', 'select'] as const) {
      expect(
        decideScenarioAction({
          kind,
          runActive: true,
          selectionLoading: false,
          draftDirty: false,
          currentScenarioId: 'local:current',
          target: kind === 'select' ? target() : undefined,
        }),
      ).toBe('blocked');
    }
  });

  it('derives one blocker and action-specific explanation for file saves', () => {
    const valid = {
      runActive: false,
      fileBusy: false,
      selectionLoading: false,
      validationPending: false,
      issueCount: 0,
    };
    const cases: Array<{
      input: Partial<typeof valid>;
      blocker: ScenarioFileBlocker;
      saveReason: string;
      saveAsReason: string;
    }> = [
      { input: {}, blocker: null, saveReason: '', saveAsReason: '' },
      {
        input: { runActive: true },
        blocker: 'run_active',
        saveReason: 'Saving is disabled while a run is active',
        saveAsReason: 'Save as is disabled while a run is active',
      },
      {
        input: { fileBusy: true },
        blocker: 'file_busy',
        saveReason: 'Wait for the current scenario file operation to finish',
        saveAsReason: 'Wait for the current scenario file operation to finish',
      },
      {
        input: { selectionLoading: true },
        blocker: 'scenario_loading',
        saveReason: 'Wait for the selected scenario to finish loading',
        saveAsReason: 'Wait for the selected scenario to finish loading',
      },
      {
        input: { validationPending: true },
        blocker: 'validation_pending',
        saveReason: 'Fix scenario issues before saving',
        saveAsReason: 'Fix scenario issues before saving a copy',
      },
      {
        input: { issueCount: 1 },
        blocker: 'invalid',
        saveReason: 'Fix scenario issues before saving',
        saveAsReason: 'Fix scenario issues before saving a copy',
      },
    ];

    for (const testCase of cases) {
      const blocker = getScenarioFileBlocker({ ...valid, ...testCase.input });
      expect(blocker).toBe(testCase.blocker);
      expect(getScenarioFileDisabledReason(blocker, 'save')).toBe(testCase.saveReason);
      expect(getScenarioFileDisabledReason(blocker, 'save_as')).toBe(testCase.saveAsReason);
    }
  });
});
