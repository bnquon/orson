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

function bootstrapCall(request: () => Promise<api.WorkspaceBootstrapResponse>): BootstrapResult {
  return call(request);
}

export function bootstrapWorkspace(): BootstrapResult {
  return bootstrapCall(() => BootstrapWorkspace());
}

export function createWorkspace(name: string): BootstrapResult {
  return bootstrapCall(() => CreateWorkspace(name));
}

export function renameWorkspace(id: string, name: string): BootstrapResult {
  return bootstrapCall(() => RenameWorkspace(id, name));
}

export function deleteWorkspace(id: string): BootstrapResult {
  return bootstrapCall(() => DeleteWorkspace(id));
}

export function setActiveWorkspace(id: string): BootstrapResult {
  return bootstrapCall(() => SetActiveWorkspace(id));
}

export function retryWorkspacePersistence(confirmSessionWrite: boolean): BootstrapResult {
  return bootstrapCall(() => RetryWorkspacePersistence(confirmSessionWrite));
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
