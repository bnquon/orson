import type { ReactNode } from 'react';
import { Toast } from '../../components/Toast';
import {
  ScenarioFileOperationError,
  ScenarioLoadState,
} from '../workbench/components/ScenarioLoadState';
import { WorkbenchPage } from '../workbench/WorkbenchPage';
import { createUnsavedScenario } from '../workbench/scenarioFactory';
import type { KafkaConnection, LoadedScenario } from '../workbench/types';
import type { ScenarioController } from '../workbench/useScenario';
import type { WorkbenchScenarioModel } from '../workbench/workbenchPageTypes';
import { WorkbenchShell } from '../workbench/components/WorkbenchShell';
import type { WorkspaceController, WorkspaceGuardState } from './useWorkspace';

const emptyWorkbenchScenario: LoadedScenario = {
  id: 'empty-workbench',
  relativePath: '',
  folderPath: '',
  name: 'No scenario selected',
  sourceFilename: '',
  source: 'unsaved',
  sourcePath: '',
  localStatus: null,
  draft: createUnsavedScenario(),
  warnings: [],
};

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

  const emptyWorkbench =
    scenario.activeScenarioCleared ||
    (examplesDismissed &&
      scenario.localScenarios.length === 0 &&
      scenario.catalogStatus !== 'loading' &&
      scenario.catalogStatus !== 'failed' &&
      scenario.selectedLoadStatus !== 'loading' &&
      (scenario.scenario === null || scenario.scenario.source !== 'unsaved'));
  const folderFeedbackToast = scenario.folderFeedback.successMessage ? (
    <Toast
      message={scenario.folderFeedback.successMessage}
      tone="success"
      onDismiss={() => scenario.clearFolderFeedback()}
    />
  ) : null;

  const handleExamplesDismissedChange = (dismissed: boolean) => {
    onExamplesDismissedChange(dismissed);
    if (!dismissed && scenario.scenario === null) void scenario.retry();
  };
  const scenarioFileError = scenario.fileFeedback.error ? (
    <ScenarioFileOperationError
      error={scenario.fileFeedback.error}
      diagnostics={scenario.fileFeedback.diagnostics}
      onDismiss={() => scenario.clearFileFeedback()}
    />
  ) : null;
  const scenarioModel: WorkbenchScenarioModel = {
    active: scenario.scenario ?? emptyWorkbenchScenario,
    catalog: {
      examples: scenario.examples,
      localScenarios: scenario.localScenarios,
      selectedScenarioId: scenario.selectedScenarioId,
      selectedDescriptor: scenario.selectedDescriptor,
      selectedLoadError: scenario.selectedLoadError,
      selectedDiagnostics: scenario.selectedDiagnostics,
      scenarioLoadingId:
        scenario.selectedLoadStatus === 'loading' ? scenario.selectedScenarioId : null,
      scenarioCatalogLoading: scenario.catalogStatus === 'loading',
      examplesExpanded,
      examplesDismissed,
      onExamplesExpandedChange,
      onExamplesDismissedChange: handleExamplesDismissedChange,
    },
    files: {
      fileFeedback: scenario.fileFeedback,
      onSelectScenario: (id) => scenario.selectScenario(id),
      onCreateScenario: () => scenario.createScenario(),
      onExitUnsavedScenario: () => scenario.exitScenario(),
      onImportScenario: () => scenario.importScenario(),
      onRemoveScenario: (id) => scenario.removeScenario(id),
      onSaveScenario: (draft) => scenario.saveScenario(draft),
      onSaveScenarioAs: (draft) => scenario.saveScenarioAs(draft),
      onClearFileFeedback: () => scenario.clearFileFeedback(),
      onRetrySelectedScenario: () => scenario.retrySelectedScenario(),
    },
    folders: {
      localFolders: scenario.localFolders,
      folderOperation: scenario.folderOperation,
      folderError: scenario.folderError,
      onCreateFolder: (name, parentId) => scenario.createFolder(name, parentId),
      onRenameFolder: (id, name) => scenario.renameFolder(id, name),
      onDeleteFolder: (id) => scenario.deleteFolder(id),
      onMoveFolder: (id, parentId) => scenario.moveFolder(id, parentId),
      onReorderFolder: (id, siblingIndex) => scenario.reorderFolder(id, siblingIndex),
      onMoveScenario: (id, folderId, siblingIndex) =>
        scenario.moveScenario(id, folderId, siblingIndex),
      onClearFolderError: () => scenario.clearFolderError(),
    },
  };

  if (
    !emptyWorkbench &&
    scenario.scenario === null &&
    (scenario.catalogStatus === 'loading' || scenario.selectedLoadStatus === 'loading')
  ) {
    return (
      <>
        <WorkspaceStateShell {...shellProps}>
          <>
            {scenarioFileError}
            <ScenarioLoadState status="loading" />
          </>
        </WorkspaceStateShell>
        {folderFeedbackToast}
      </>
    );
  }

  if (!emptyWorkbench && scenario.scenario === null) {
    return (
      <>
        <WorkspaceStateShell {...shellProps}>
          <>
            {scenarioFileError}
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
          </>
        </WorkspaceStateShell>
        {folderFeedbackToast}
      </>
    );
  }

  return (
    <>
      <WorkbenchPage
        key={data.activeWorkspace.id}
        workspaceId={data.activeWorkspace.id}
        connection={connection}
        scenario={scenarioModel}
        emptyWorkbench={emptyWorkbench}
        shell={{
          connectionDialogOpen,
          onConnectionToggle,
          onNavigateHome,
          workspaceSelector,
        }}
        onWorkspaceGuardChange={onWorkspaceGuardChange}
      />
      {folderFeedbackToast}
    </>
  );
}
