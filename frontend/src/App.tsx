import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { IconoirProvider } from 'iconoir-react';
import type { api } from '../wailsjs/go/models';
import { ConnectionDialog } from './features/connection/ConnectionDialog';
import { useConnection } from './features/connection/useConnection';
import type { ConnectionFormValues } from './features/connection/types';
import { Toast } from './components/Toast';
import { WorkbenchPage } from './features/workbench/WorkbenchPage';
import type { KafkaConnection } from './features/workbench/types';
import { ScenarioLoadState } from './features/workbench/components/ScenarioLoadState';
import { WorkbenchShell } from './features/workbench/components/WorkbenchShell';
import { useScenario } from './features/workbench/useScenario';
import {
  WorkspacePersistenceNotice,
  WorkspaceSelector,
} from './features/workspace/WorkspaceSelector';
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

function WorkspaceStateShell({
  connection,
  workspaceSelector,
  connectionDialogOpen,
  onConnectionToggle,
  children,
}: {
  connection: KafkaConnection;
  workspaceSelector: ReactNode;
  connectionDialogOpen: boolean;
  onConnectionToggle: () => void;
  children: ReactNode;
}) {
  return (
    <WorkbenchShell
      connection={connection}
      workspaceSelector={workspaceSelector}
      connectionDialogOpen={connectionDialogOpen}
      onConnectionToggle={onConnectionToggle}
      sidebar={<aside className="scenario-sidebar" />}
      toolbar={<div />}
      workspace={children}
      workspaceMode="compose"
      workspaceInert={false}
      previousRun={<aside />}
      runStatus="idle"
      statusDetail="Select a scenario to begin"
    />
  );
}

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
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [workspaceToast, setWorkspaceToast] = useState<string | null>(null);
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
    setWorkspaceToast(`Created and switched to ${workspaceName}.`);
    setConnectionDialogOpen(true);
  }, []);

  const handleWorkspaceDeleted = useCallback((workspaceName: string) => {
    setWorkspaceToast(`Deleted ${workspaceName}.`);
  }, []);

  const workspaceSelector = (
    <WorkspaceSelector
      controller={workspace}
      guards={workspaceGuards}
      onCreated={handleWorkspaceCreated}
      onDeleted={handleWorkspaceDeleted}
    />
  );
  const hasValidScenario = scenario.descriptors.some(
    (descriptor) => descriptor.status !== 'invalid',
  );

  let content;
  if (workspace.data === null && workspace.status === 'loading') {
    content = <ScenarioLoadState status="loading" />;
  } else if (workspace.data === null) {
    content = (
      <ScenarioLoadState
        status="failed"
        error={workspace.error}
        onRetry={() => void workspace.bootstrap()}
      />
    );
  } else if (
    scenario.scenario === null &&
    (scenario.catalogStatus === 'loading' || scenario.selectedLoadStatus === 'loading')
  ) {
    content = (
      <WorkspaceStateShell
        connection={workbenchConnection}
        workspaceSelector={workspaceSelector}
        connectionDialogOpen={connectionDialogOpen}
        onConnectionToggle={() => setConnectionDialogOpen((open) => !open)}
      >
        <ScenarioLoadState status="loading" />
      </WorkspaceStateShell>
    );
  } else if (scenario.scenario === null) {
    content = (
      <WorkspaceStateShell
        connection={workbenchConnection}
        workspaceSelector={workspaceSelector}
        connectionDialogOpen={connectionDialogOpen}
        onConnectionToggle={() => setConnectionDialogOpen((open) => !open)}
      >
        <ScenarioLoadState
          status={
            scenario.catalogStatus === 'failed' ||
            (scenario.selectedLoadStatus === 'failed' && hasValidScenario)
              ? 'failed'
              : 'empty'
          }
          error={scenario.error}
          descriptors={scenario.descriptors}
          onRetry={() => void scenario.retry()}
        />
      </WorkspaceStateShell>
    );
  } else {
    content = (
      <WorkbenchPage
        key={workspace.data.activeWorkspace.id}
        connection={workbenchConnection}
        scenario={scenario.scenario}
        examples={scenario.examples}
        localScenarios={scenario.localScenarios}
        selectedScenarioId={scenario.selectedScenarioId}
        selectedDescriptor={scenario.selectedDescriptor}
        selectedLoadError={scenario.selectedLoadError}
        selectedDiagnostics={scenario.selectedDiagnostics}
        scenarioLoadingId={
          scenario.selectedLoadStatus === 'loading' ? scenario.selectedScenarioId : null
        }
        scenarioCatalogLoading={scenario.catalogStatus === 'loading'}
        examplesExpanded={examplesExpanded}
        examplesDismissed={examplesDismissed}
        onExamplesExpandedChange={setExamplesExpanded}
        onExamplesDismissedChange={setExamplesDismissed}
        fileFeedback={scenario.fileFeedback}
        onSelectScenario={(id) => scenario.selectScenario(id)}
        onImportScenario={() => scenario.importScenario()}
        onRemoveScenario={(id) => scenario.removeScenario(id)}
        onSaveScenario={(draft) => scenario.saveScenario(draft)}
        onSaveScenarioAs={(draft) => scenario.saveScenarioAs(draft)}
        onClearFileFeedback={() => scenario.clearFileFeedback()}
        onRetrySelectedScenario={() => scenario.retrySelectedScenario()}
        connectionDialogOpen={connectionDialogOpen}
        onConnectionToggle={() => setConnectionDialogOpen((open) => !open)}
        workspaceSelector={workspaceSelector}
        onWorkspaceGuardChange={handleWorkspaceGuardChange}
      />
    );
  }

  return (
    <IconoirProvider iconProps={{ width: 18, height: 18, strokeWidth: 1.5 }}>
      {content}
      {workspace.data !== null ? (
        <>
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
          <WorkspacePersistenceNotice controller={workspace} />
        </>
      ) : null}
      {workspaceToast !== null ? (
        <Toast message={workspaceToast} tone="success" onDismiss={() => setWorkspaceToast(null)} />
      ) : null}
    </IconoirProvider>
  );
}

export default App;
