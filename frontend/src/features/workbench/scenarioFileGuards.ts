import type { ScenarioDescriptor } from './types';

export type ScenarioActionDecision = 'blocked' | 'confirm' | 'proceed';
export type PendingScenarioAction = { kind: 'select'; id: string } | { kind: 'import' };
export type ScenarioFileBlocker =
  'run_active' | 'file_busy' | 'scenario_loading' | 'validation_pending' | 'invalid' | null;
export type ScenarioFileAction = 'save' | 'save_as';

export function executeScenarioAction(
  action: PendingScenarioAction,
  callbacks: { importScenario(): void; selectScenario(id: string): void },
): void {
  if (action.kind === 'import') callbacks.importScenario();
  else callbacks.selectScenario(action.id);
}

export function decideScenarioAction(input: {
  kind: 'import' | 'select';
  runActive: boolean;
  selectionLoading: boolean;
  draftDirty: boolean;
  currentScenarioId: string;
  target?: ScenarioDescriptor;
}): ScenarioActionDecision {
  if (input.runActive || (input.kind === 'import' && input.selectionLoading)) return 'blocked';
  if (input.kind === 'select' && input.target?.id === input.currentScenarioId) return 'proceed';

  const canReplaceDraft = input.kind === 'import' || input.target?.status !== 'invalid';
  return input.draftDirty && canReplaceDraft ? 'confirm' : 'proceed';
}

export function getScenarioFileBlocker(input: {
  runActive: boolean;
  fileBusy: boolean;
  selectionLoading: boolean;
  validationPending: boolean;
  issueCount: number;
}): ScenarioFileBlocker {
  if (input.runActive) return 'run_active';
  if (input.fileBusy) return 'file_busy';
  if (input.selectionLoading) return 'scenario_loading';
  if (input.validationPending) return 'validation_pending';
  if (input.issueCount > 0) return 'invalid';
  return null;
}

export function getScenarioFileDisabledReason(
  blocker: ScenarioFileBlocker,
  action: ScenarioFileAction,
): string {
  switch (blocker) {
    case 'run_active':
      return action === 'save'
        ? 'Saving is disabled while a run is active'
        : 'Save as is disabled while a run is active';
    case 'file_busy':
      return 'Wait for the current scenario file operation to finish';
    case 'scenario_loading':
      return 'Wait for the selected scenario to finish loading';
    case 'validation_pending':
    case 'invalid':
      return action === 'save'
        ? 'Fix scenario issues before saving'
        : 'Fix scenario issues before saving a copy';
    case null:
      return '';
  }
}
