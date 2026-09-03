import {
  BootstrapWorkspace,
  CreateWorkspace,
  DeleteWorkspace,
  RenameWorkspace,
  RetryWorkspacePersistence,
  SetActiveWorkspace,
  SetWorkspaceSelectedScenario,
} from '../../wailsjs/go/main/App';
import { api } from '../../wailsjs/go/models';
import { call } from './client';
import type { Result } from './result';

type BootstrapResult = Promise<Result<api.WorkspaceBootstrapData>>;

export function bootstrapWorkspace(): BootstrapResult {
  return call(() => BootstrapWorkspace());
}

export function createWorkspace(name: string): BootstrapResult {
  return call(() => CreateWorkspace(name));
}

export function renameWorkspace(id: string, name: string): BootstrapResult {
  return call(() => RenameWorkspace(id, name));
}

export function deleteWorkspace(id: string): BootstrapResult {
  return call(() => DeleteWorkspace(id));
}

export function setActiveWorkspace(id: string): BootstrapResult {
  return call(() => SetActiveWorkspace(id));
}

export function retryWorkspacePersistence(confirmSessionWrite: boolean): BootstrapResult {
  return call(() => RetryWorkspacePersistence(confirmSessionWrite));
}

export function setWorkspaceSelectedScenario(
  workspaceId: string,
  source: 'example' | 'local',
  scenarioId: string,
): Promise<Result<api.WorkspacePersistenceStatus>> {
  return call(async () => {
    const response = await SetWorkspaceSelectedScenario(
      new api.WorkspaceSelectionRequest({ workspaceId, source, scenarioId }),
    );
    return response.ok && response.persistence !== undefined
      ? { ok: true, data: response.persistence }
      : {
          ok: false,
          error: response.error ?? {
            code: 'workspace_selection_failed',
            message: 'The selected scenario could not be remembered.',
            retryable: true,
          },
        };
  });
}
