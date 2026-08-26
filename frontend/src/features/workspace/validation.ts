import type { api } from '../../../wailsjs/go/models';

export function validateWorkspaceName(
  rawName: string,
  workspaces: api.Workspace[],
  currentWorkspaceId = '',
): string | null {
  const name = rawName.trim();
  if (name === '') return 'Enter a workspace name.';
  const duplicate = workspaces.some(
    (workspace) =>
      workspace.id !== currentWorkspaceId &&
      workspace.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  return duplicate ? 'A workspace with that name already exists.' : null;
}
