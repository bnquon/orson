import { useMemo, useState } from 'react';
import { IconoirProvider } from 'iconoir-react';
import type { api } from '../wailsjs/go/models';
import { ConnectionDialog } from './features/connection/ConnectionDialog';
import { ConnectionPage } from './features/connection/ConnectionPage';
import { useConnection } from './features/connection/useConnection';
import type { ConnectionFormValues } from './features/connection/types';
import { WorkbenchPage } from './features/workbench/WorkbenchPage';
import type { KafkaConnection } from './features/workbench/types';
import { ScenarioLoadState } from './features/workbench/components/ScenarioLoadState';
import { useScenario } from './features/workbench/useScenario';

function toWorkbenchConnection(info: api.ConnectionInfo): KafkaConnection {
  return {
    name: info.name,
    brokers: [...info.brokers],
    clientId: info.clientId,
    dialTimeoutSeconds: info.dialTimeoutSeconds,
    status: 'connected',
  };
}

function App() {
  const connection = useConnection();
  const scenario = useScenario();
  const hasValidScenario = scenario.descriptors.some(
    (descriptor) => descriptor.status !== 'invalid',
  );
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [examplesExpanded, setExamplesExpanded] = useState(true);
  const [examplesDismissed, setExamplesDismissed] = useState(false);
  const activeConnection = useMemo(
    () =>
      connection.activeConnection === null
        ? null
        : toWorkbenchConnection(connection.activeConnection),
    [connection.activeConnection],
  );

  const handleConnect = (values: ConnectionFormValues) => {
    void connection.connect(values).then((result) => {
      if (result.ok) setConnectionDialogOpen(false);
    });
  };

  const handleDisconnect = () => {
    void connection.disconnect();
  };

  return (
    <IconoirProvider iconProps={{ width: 18, height: 18, strokeWidth: 1.5 }}>
      {activeConnection === null ? (
        <ConnectionPage
          attempt={connection.latestAttempt}
          startupStatus={connection.startup.status}
          error={connection.setupError}
          operation={connection.operation}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onRetryStartup={() => void connection.retryStartup()}
          onClearErrors={() => connection.clearTransientErrors()}
        />
      ) : scenario.scenario === null &&
        (scenario.catalogStatus === 'loading' || scenario.selectedLoadStatus === 'loading') ? (
        <ScenarioLoadState status="loading" />
      ) : scenario.scenario === null ? (
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
      ) : (
        <>
          <WorkbenchPage
            connection={activeConnection}
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
            onSaveScenario={(draft) => scenario.saveScenario(draft)}
            onSaveScenarioAs={(draft) => scenario.saveScenarioAs(draft)}
            onClearFileFeedback={() => scenario.clearFileFeedback()}
            onRetrySelectedScenario={() => scenario.retrySelectedScenario()}
            connectionDialogOpen={connectionDialogOpen}
            onConnectionToggle={() => setConnectionDialogOpen((open) => !open)}
          />
          <ConnectionDialog
            open={connectionDialogOpen}
            activeConnection={connection.activeConnection!}
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
        </>
      )}
    </IconoirProvider>
  );
}

export default App;
