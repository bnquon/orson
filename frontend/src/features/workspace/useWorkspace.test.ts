import { describe, expect, it } from 'vitest';
import { api } from '../../../wailsjs/go/models';
import { initialWorkspaceState, workspaceReducer } from './useWorkspace';

function bootstrap(mode = 'persistent'): api.WorkspaceBootstrapData {
  const activeWorkspace = new api.Workspace({ id: 'workspace-1', name: 'My workspace' });
  return new api.WorkspaceBootstrapData({
    workspaces: [activeWorkspace],
    activeWorkspace,
    bundledScenarios: [],
    localScenarios: [],
    connection: new api.ConnectionState({
      latestAttempt: new api.ConnectionAttempt({ status: 'disconnected' }),
    }),
    persistence: new api.WorkspacePersistenceStatus({
      mode,
      recoveryAvailable: mode === 'session_only',
      sessionDirty: false,
    }),
  });
}

describe('workspaceReducer', () => {
  it('applies the complete bootstrap snapshot as one state transition', () => {
    const data = bootstrap();
    const state = workspaceReducer(initialWorkspaceState, { type: 'loaded', data });

    expect(state.status).toBe('ready');
    expect(state.data?.activeWorkspace.name).toBe('My workspace');
    expect(state.data?.connection.latestAttempt.status).toBe('disconnected');
    expect(state.data?.persistence.mode).toBe('persistent');
  });

  it('keeps usable bootstrap data when a later operation fails', () => {
    const loaded = workspaceReducer(initialWorkspaceState, {
      type: 'loaded',
      data: bootstrap(),
    });
    const failed = workspaceReducer(loaded, {
      type: 'failed',
      error: { code: 'workspace_name_duplicate', message: 'Already exists.', retryable: false },
    });

    expect(failed.status).toBe('ready');
    expect(failed.data).toBe(loaded.data);
    expect(failed.error?.code).toBe('workspace_name_duplicate');
  });

  it('updates remembered connection and fallback state after a successful connect', () => {
    const loaded = workspaceReducer(initialWorkspaceState, {
      type: 'loaded',
      data: bootstrap(),
    });
    const connection = new api.ConnectionState({
      active: new api.ConnectionInfo({
        name: 'Local Kafka',
        brokers: ['localhost:9092'],
        clientId: 'orson',
        dialTimeoutSeconds: 5,
      }),
      latestAttempt: new api.ConnectionAttempt({ status: 'connected' }),
      persistence: new api.WorkspacePersistenceStatus({
        mode: 'session_only',
        warning: 'Session only—workspace changes will be lost when Orson closes.',
        recoveryAvailable: true,
        sessionDirty: true,
      }),
    });
    const state = workspaceReducer(loaded, { type: 'connection', connection });

    expect(state.data?.rememberedConnection?.name).toBe('Local Kafka');
    expect(state.data?.persistence.mode).toBe('session_only');
  });

  it('keeps remembered connection settings after disconnecting', () => {
    const remembered = new api.ConnectionInfo({
      name: 'Local Kafka',
      brokers: ['localhost:9092'],
      clientId: 'orson',
      dialTimeoutSeconds: 5,
    });
    const loaded = workspaceReducer(initialWorkspaceState, {
      type: 'loaded',
      data: new api.WorkspaceBootstrapData({
        ...bootstrap(),
        rememberedConnection: remembered,
      }),
    });

    const state = workspaceReducer(loaded, {
      type: 'connection',
      connection: new api.ConnectionState({
        latestAttempt: new api.ConnectionAttempt({ status: 'disconnected' }),
      }),
    });

    expect(state.data?.rememberedConnection?.name).toBe('Local Kafka');
  });
});
