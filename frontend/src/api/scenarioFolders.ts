import {
  CreateScenarioFolder,
  DeleteScenarioFolder,
  MoveLocalScenario,
  MoveScenarioFolder,
  ReorderScenarioFolder,
  RenameScenarioFolder,
} from '../../wailsjs/go/main/App';
import { api } from '../../wailsjs/go/models';
import type { ApiError } from './result';

export type ScenarioFolderResult =
  | { ok: true; data: api.ScenarioFolderData }
  | { ok: false; error: ApiError; data?: api.ScenarioFolderData };

async function folderCall(
  request: () => Promise<api.ScenarioFolderResponse>,
): Promise<ScenarioFolderResult> {
  try {
    const response = await request();
    if (response.ok && response.data !== undefined) return { ok: true, data: response.data };
    return {
      ok: false,
      error: response.error ?? {
        code: 'scenario_folder_operation_failed',
        message: 'The scenario folder operation could not be completed.',
        retryable: true,
      },
      data: response.data,
    };
  } catch {
    return {
      ok: false,
      error: {
        code: 'bridge_error',
        message: 'The app could not communicate with the backend.',
        retryable: true,
      },
    };
  }
}

export function createScenarioFolder(name: string, parentId = ''): Promise<ScenarioFolderResult> {
  return folderCall(() => CreateScenarioFolder(name, parentId));
}

export function renameScenarioFolder(id: string, name: string): Promise<ScenarioFolderResult> {
  return folderCall(() => RenameScenarioFolder(id, name));
}

export function moveScenarioFolder(
  folderId: string,
  parentId: string,
): Promise<ScenarioFolderResult> {
  return folderCall(() =>
    MoveScenarioFolder(new api.MoveScenarioFolderRequest({ folderId, parentId })),
  );
}

export function reorderScenarioFolder(
  folderId: string,
  siblingIndex: number,
): Promise<ScenarioFolderResult> {
  return folderCall(() =>
    ReorderScenarioFolder(new api.ReorderScenarioFolderRequest({ folderId, siblingIndex })),
  );
}

export function moveLocalScenario(
  scenarioId: string,
  folderId: string,
  siblingIndex: number,
): Promise<ScenarioFolderResult> {
  return folderCall(() =>
    MoveLocalScenario(new api.MoveLocalScenarioRequest({ scenarioId, folderId, siblingIndex })),
  );
}

export function deleteScenarioFolder(id: string): Promise<ScenarioFolderResult> {
  return folderCall(() => DeleteScenarioFolder(id));
}
