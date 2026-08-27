import type { ReactNode } from 'react';
import { ScenarioLoadState } from '../workbench/components/ScenarioLoadState';
import { WorkbenchPage } from '../workbench/WorkbenchPage';
import type { KafkaConnection } from '../workbench/types';
import type { ScenarioController } from '../workbench/useScenario';
import { WorkbenchShell } from '../workbench/components/WorkbenchShell';
import type { WorkspaceController, WorkspaceGuardState } from './useWorkspace';

interface WorkspaceContentProps {
  workspace: WorkspaceController;
  scenario: ScenarioController;
  connection: KafkaConnection;
  launcherOpen: boolean;
  launcher: ReactNode;
  workspaceSelector: ReactNode;
  connectionDialogOpen: boolean;
  onConnectionToggle: () => void;
  onNavigateHome: () => void;
  onWorkspaceGuardChange: (guards: WorkspaceGuardState) => void;
  examplesExpanded: boolean;
  examplesDismissed: boolean;
  onExamplesExpandedChange: (expanded: boolean) => void;
  onExamplesDismissedChange: (dismissed: boolean) => void;
}

function WorkspaceStateShell({
  connection,
  workspaceSelector,
  connectionDialogOpen,
  onConnectionToggle,
  onNavigateHome,
  children,
}: {
  connection: KafkaConnection;
  workspaceSelector: ReactNode;
  connectionDialogOpen: boolean;
  onConnectionToggle: () => void;
  onNavigateHome: () => void;
  children: ReactNode;
}) {
  return (
    <WorkbenchShell
      connection={connection}
      workspaceSelector={workspaceSelector}
      onNavigateHome={onNavigateHome}
      connectionDialogOpen={connectionDialogOpen}
      onConnectionToggle={onConnectionToggle}
      sidebar={<aside className="scenario-sidebar" />}
      toolbar={<div />}
      workspace={children}
      workspaceMode="compose"
      workspaceAriaLabel="Workspace state"
      workspaceInert={false}
      previousRun={<aside />}
      runStatus="idle"
      statusDetail="Select a scenario to begin"
    />
  );
}

export function WorkspaceContent({
  workspace,
  scenario,
  connection,
  launcherOpen,
  launcher,
  workspaceSelector,
  connectionDialogOpen,
  onConnectionToggle,
  onNavigateHome,
  onWorkspaceGuardChange,
  examplesExpanded,
  examplesDismissed,
  onExamplesExpandedChange,
  onExamplesDismissedChange,
}: WorkspaceContentProps) {
  const data = workspace.data;
  if (data === null || launcherOpen) return launcher;

  const hasValidScenario = scenario.descriptors.some(
    (descriptor) => descriptor.status !== 'invalid',
  );
  const shellProps = {
    connection,
    workspaceSelector,
    connectionDialogOpen,
    onConnectionToggle,
    onNavigateHome,
  };

  if (
    scenario.scenario === null &&
    (scenario.catalogStatus === 'loading' || scenario.selectedLoadStatus === 'loading')
  ) {
    return (
      <WorkspaceStateShell {...shellProps}>
        <ScenarioLoadState status="loading" />
      </WorkspaceStateShell>
    );
  }

  if (scenario.scenario === null) {
    return (
      <WorkspaceStateShell {...shellProps}>
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
  }

  return (
    <WorkbenchPage
      key={data.activeWorkspace.id}
      workspaceId={data.activeWorkspace.id}
      connection={connection}
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
      onExamplesExpandedChange={onExamplesExpandedChange}
      onExamplesDismissedChange={onExamplesDismissedChange}
      fileFeedback={scenario.fileFeedback}
      onSelectScenario={(id) => scenario.selectScenario(id)}
      onImportScenario={() => scenario.importScenario()}
      onRemoveScenario={(id) => scenario.removeScenario(id)}
      onSaveScenario={(draft) => scenario.saveScenario(draft)}
      onSaveScenarioAs={(draft) => scenario.saveScenarioAs(draft)}
      onClearFileFeedback={() => scenario.clearFileFeedback()}
      onRetrySelectedScenario={() => scenario.retrySelectedScenario()}
      connectionDialogOpen={connectionDialogOpen}
      onConnectionToggle={onConnectionToggle}
      onNavigateHome={onNavigateHome}
      workspaceSelector={workspaceSelector}
      onWorkspaceGuardChange={onWorkspaceGuardChange}
    />
  );
}
