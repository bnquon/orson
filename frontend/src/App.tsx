import { useCallback, useMemo, useState } from 'react';
import { IconoirProvider } from 'iconoir-react';
import type { api } from '../wailsjs/go/models';
import { ConnectionDialog } from './features/connection/ConnectionDialog';
import { useConnection } from './features/connection/useConnection';
import type { ConnectionFormValues } from './features/connection/types';
import { Toast } from './components/Toast';
import type { KafkaConnection } from './features/workbench/types';
import { useScenario } from './features/workbench/useScenario';
import {
  WorkspacePersistenceNotice,
  WorkspaceSelector,
} from './features/workspace/WorkspaceSelector';
import { WorkspaceStartScreen } from './features/workspace/WorkspaceStartScreen';
import { WorkspaceContent } from './features/workspace/WorkspaceContent';
import { useWorkspace, type WorkspaceGuardState } from './features/workspace/useWorkspace';

function toWorkbenchConnection(
  active: api.ConnectionInfo | null,
  remembered: api.ConnectionInfo | null,
): KafkaConnection {
  const source = active ?? remembered;
  return {
    name: source?.name ?? 'Disconnected',
    brokers: [...(source?.brokers ?? [])],
    clientId: source?.clientId ?? 'orson',
    dialTimeoutSeconds: source?.dialTimeoutSeconds ?? 5,
    status: active === null ? 'disconnected' : 'connected',
  };
}

const initialGuards: WorkspaceGuardState = { runActive: false, draftDirty: false };

function App() {
  const workspace = useWorkspace();
  const connection = useConnection(workspace.data?.connection ?? null);
  const scenario = useScenario({
    bootstrap: workspace.data,
    bootstrapError: workspace.data === null ? workspace.error : null,
    onRetryBootstrap: () => workspace.bootstrap(),
    onRememberScenario: (source, scenarioId) => workspace.rememberScenario(source, scenarioId),
    onPersistence: (status) => workspace.applyPersistence(status),
  });
  const [workspaceGuards, setWorkspaceGuards] = useState(initialGuards);
  const [workspaceLauncherOpen, setWorkspaceLauncherOpen] = useState(true);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [workspaceToast, setWorkspaceToast] = useState<{
    message: string;
    tone: 'success' | 'error';
  } | null>(null);
  const [examplesExpanded, setExamplesExpanded] = useState(true);
  const [examplesDismissed, setExamplesDismissed] = useState(false);
  const activeConnection = workspace.data?.connection.active ?? null;
  const rememberedConnection = workspace.data?.rememberedConnection ?? null;
  const workbenchConnection = useMemo(
    () => toWorkbenchConnection(activeConnection, rememberedConnection),
    [activeConnection, rememberedConnection],
  );
  const handleWorkspaceGuardChange = useCallback((guards: WorkspaceGuardState) => {
    setWorkspaceGuards((current) =>
      current.runActive === guards.runActive && current.draftDirty === guards.draftDirty
        ? current
        : guards,
    );
  }, []);

  const handleConnect = (values: ConnectionFormValues) => {
    void connection.connect(values).then((result) => {
      if (!result.ok) return;
      workspace.applyConnection(result.data);
      setConnectionDialogOpen(false);
    });
  };

  const handleDisconnect = () => {
    void connection.disconnect().then((result) => {
      if (result.ok) workspace.applyConnection(result.data);
    });
  };

  const handleWorkspaceCreated = useCallback((workspaceName: string) => {
    setWorkspaceGuards(initialGuards);
    setWorkspaceLauncherOpen(false);
    setWorkspaceToast({ message: `Created and switched to ${workspaceName}.`, tone: 'success' });
    setConnectionDialogOpen(true);
  }, []);

  const handleWorkspaceEntered = useCallback(() => {
    setWorkspaceGuards(initialGuards);
    setWorkspaceLauncherOpen(false);
  }, []);

  const navigateHome = useCallback(async () => {
    if (connection.activeConnection !== null) {
      const result = await connection.disconnect();
      if (!result.ok) {
        setWorkspaceToast({
          message: result.error.message,
          tone: 'error',
        });
        return;
      }
      workspace.applyConnection(result.data);
    }
    setWorkspaceGuards(initialGuards);
    setConnectionDialogOpen(false);
    setWorkspaceLauncherOpen(true);
  }, [connection, workspace]);

  const handleNavigateHome = useCallback(() => {
    const decision = workspace.requestNavigateHome(workspaceGuards);
    if (decision === 'blocked') {
      setWorkspaceToast({
        message: 'Finish the active run before opening the workspace launcher.',
        tone: 'error',
      });
      return;
    }
    if (decision === 'started') void navigateHome();
  }, [navigateHome, workspace, workspaceGuards]);

  const handleWorkspaceDeleted = useCallback((workspaceName: string, returnToLauncher: boolean) => {
    if (returnToLauncher) {
      setConnectionDialogOpen(false);
      setWorkspaceLauncherOpen(true);
    }
    setWorkspaceToast({ message: `Deleted ${workspaceName}.`, tone: 'success' });
  }, []);

  const hasWorkspaces = workspace.data !== null && workspace.data.workspaces.length > 0;
  const showWorkspaceLauncher = workspaceLauncherOpen || !hasWorkspaces;
  const workspaceSelector = !showWorkspaceLauncher ? (
    <WorkspaceSelector
      controller={workspace}
      guards={workspaceGuards}
      onCreated={handleWorkspaceCreated}
      onDeleted={handleWorkspaceDeleted}
      onHomeConfirmed={() => void navigateHome()}
    />
  ) : null;
  const workspaceStartScreen = (
    <WorkspaceStartScreen
      controller={workspace}
      onCreated={handleWorkspaceCreated}
      onDeleted={handleWorkspaceDeleted}
      onEntered={handleWorkspaceEntered}
    />
  );

  const content = (
    <WorkspaceContent
      workspace={workspace}
      scenario={scenario}
      connection={workbenchConnection}
      launcherOpen={showWorkspaceLauncher}
      launcher={workspaceStartScreen}
      workspaceSelector={workspaceSelector}
      connectionDialogOpen={connectionDialogOpen}
      onConnectionToggle={() => setConnectionDialogOpen((open) => !open)}
      onNavigateHome={handleNavigateHome}
      onWorkspaceGuardChange={handleWorkspaceGuardChange}
      examplesExpanded={examplesExpanded}
      examplesDismissed={examplesDismissed}
      onExamplesExpandedChange={setExamplesExpanded}
      onExamplesDismissedChange={setExamplesDismissed}
    />
  );

  return (
    <IconoirProvider iconProps={{ width: 18, height: 18, strokeWidth: 1.5 }}>
      {content}
      {workspace.data !== null ? (
        <>
          {!showWorkspaceLauncher ? (
            <ConnectionDialog
              open={connectionDialogOpen}
              activeConnection={activeConnection}
              rememberedConnection={rememberedConnection}
              attempt={connection.latestAttempt}
              operation={connection.operation}
              error={connection.dialogError}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onClearErrors={() => connection.clearTransientErrors()}
              onClose={() => {
                connection.clearTransientErrors();
                setConnectionDialogOpen(false);
              }}
            />
          ) : null}
          <WorkspacePersistenceNotice controller={workspace} />
        </>
      ) : null}
      {workspaceToast !== null ? (
        <Toast
          message={workspaceToast.message}
          tone={workspaceToast.tone}
          onDismiss={() => setWorkspaceToast(null)}
        />
      ) : null}
    </IconoirProvider>
  );
}

export default App;
