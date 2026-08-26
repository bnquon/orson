// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../wailsjs/go/models';
import { WorkspacePersistenceNotice, WorkspaceSelector } from './WorkspaceSelector';
import type { WorkspaceController } from './useWorkspace';

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

function controller(): WorkspaceController {
  const first = new api.Workspace({ id: 'one', name: 'My workspace' });
  const second = new api.Workspace({ id: 'two', name: 'Second' });
  return {
    status: 'ready',
    operation: 'idle',
    error: null,
    pending: null,
    recoveryConfirmation: false,
    data: new api.WorkspaceBootstrapData({
      workspaces: [first, second],
      activeWorkspace: first,
      bundledScenarios: [],
      localScenarios: [],
      connection: new api.ConnectionState({ latestAttempt: { status: 'disconnected' } }),
      persistence: new api.WorkspacePersistenceStatus({ mode: 'persistent' }),
    }),
    bootstrap: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    requestSwitch: vi.fn(() => 'started' as const),
    requestNavigateHome: vi.fn(() => 'started' as const),
    requestDelete: vi.fn(() => 'confirm' as const),
    confirmPending: vi.fn(),
    cancelPending: vi.fn(),
    retryPersistence: vi.fn(),
    clearError: vi.fn(),
    cancelRecovery: vi.fn(),
    rememberScenario: vi.fn(),
    applyPersistence: vi.fn(),
    applyConnection: vi.fn(),
  };
}

describe('WorkspaceSelector', () => {
  it('renders the active workspace and exposes create, rename, and delete actions', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    const workspace = controller();

    act(() =>
      root.render(
        <WorkspaceSelector
          controller={workspace}
          guards={{ runActive: false, draftDirty: false }}
        />,
      ),
    );
    const trigger = host.querySelector<HTMLButtonElement>('.workspace-selector__trigger');
    expect(trigger?.textContent).toContain('My workspace');
    act(() => trigger?.click());

    expect(host.textContent).toContain('Second');
    expect(host.textContent).toContain('Create workspace');
    const moreActions = host.querySelector<HTMLButtonElement>(
      '[aria-label="More actions for My workspace"]',
    );
    expect(moreActions).not.toBeNull();
    act(() => moreActions?.click());
    expect(host.textContent).toContain('Rename');
    expect(host.textContent).toContain('Delete');
  });

  it('reports the active-run switching guard without calling the backend', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    const workspace = controller();
    workspace.requestSwitch = vi.fn(() => 'blocked' as const);

    act(() =>
      root.render(
        <WorkspaceSelector
          controller={workspace}
          guards={{ runActive: true, draftDirty: false }}
        />,
      ),
    );
    act(() => host.querySelector<HTMLButtonElement>('.workspace-selector__trigger')?.click());
    const second = host.querySelector<HTMLButtonElement>('[data-workspace-id="two"]');
    act(() => second?.click());

    expect(host.textContent).toContain('Finish the active run before switching workspaces.');
  });

  it('shows a failed pending action in its confirmation modal', () => {
    const workspace = controller();
    workspace.pending = { kind: 'delete', workspaceId: 'two', dirty: false };
    workspace.error = {
      code: 'workspace_write_failed',
      message: 'The workspace could not be deleted.',
      retryable: true,
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    act(() =>
      root.render(
        <WorkspaceSelector
          controller={workspace}
          guards={{ runActive: false, draftDirty: false }}
        />,
      ),
    );

    expect(document.body.textContent).toContain('The workspace could not be deleted.');
  });

  it('shows clean workspace operation failures in a dismissible toast', () => {
    const workspace = controller();
    const clearError = vi.fn();
    workspace.clearError = clearError;
    workspace.error = {
      code: 'workspace_switch_failed',
      message: 'The workspace could not be opened.',
      retryable: true,
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    act(() =>
      root.render(
        <WorkspaceSelector
          controller={workspace}
          guards={{ runActive: false, draftDirty: false }}
        />,
      ),
    );

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'The workspace could not be opened.',
    );
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Dismiss message"]')?.click());
    expect(clearError).toHaveBeenCalledOnce();
  });

  it('keeps persistence retry failures visible alongside the retry action', () => {
    const workspace = controller();
    const retryPersistence = vi.fn();
    workspace.retryPersistence = retryPersistence;
    workspace.data = new api.WorkspaceBootstrapData({
      ...workspace.data,
      persistence: new api.WorkspacePersistenceStatus({
        mode: 'session_only',
        warning: 'Workspace changes are currently session-only.',
      }),
    });
    workspace.error = {
      code: 'workspace_retry_failed',
      message: 'Persistence is still unavailable.',
      retryable: true,
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    act(() =>
      root.render(
        <>
          <WorkspaceSelector
            controller={workspace}
            guards={{ runActive: false, draftDirty: false }}
          />
          <WorkspacePersistenceNotice controller={workspace} />
        </>,
      ),
    );

    expect(host.textContent).toContain('Persistence is still unavailable.');
    const retry = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Retry',
    );
    act(() => retry?.click());
    expect(retryPersistence).toHaveBeenCalledWith(false);
  });
});
