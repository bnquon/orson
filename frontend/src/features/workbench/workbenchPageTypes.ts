import type { ReactNode } from 'react';
import type { ApiError } from '../../api/result';
import type { WorkspaceGuardState } from '../workspace/useWorkspace';
import type { ScenarioFolderOperation } from './useScenario';
import type { ScenarioDraftData } from './scenarioMapping';
import type {
  KafkaConnection,
  LoadedScenario,
  ScenarioDescriptor,
  ScenarioDiagnostic,
  ScenarioFileFeedback,
  ScenarioFileOperationOutcome,
  ScenarioFolder,
} from './types';

interface WorkbenchScenarioCatalog {
  examples: ScenarioDescriptor[];
  localScenarios: ScenarioDescriptor[];
  selectedScenarioId: string | null;
  selectedDescriptor: ScenarioDescriptor | null;
  selectedLoadError: ApiError | null;
  selectedDiagnostics: ScenarioDiagnostic[];
  scenarioLoadingId: string | null;
  scenarioCatalogLoading: boolean;
  examplesExpanded: boolean;
  examplesDismissed: boolean;
  onExamplesExpandedChange: (expanded: boolean) => void;
  onExamplesDismissedChange: (dismissed: boolean) => void;
}

interface WorkbenchScenarioFiles {
  fileFeedback: ScenarioFileFeedback;
  onSelectScenario: (id: string) => Promise<void>;
  onCreateScenario: () => void;
  onExitUnsavedScenario: () => void;
  onImportScenario: () => Promise<ScenarioFileOperationOutcome>;
  onRemoveScenario: (id: string) => Promise<ScenarioFileOperationOutcome>;
  onSaveScenario: (draft: ScenarioDraftData) => Promise<ScenarioFileOperationOutcome>;
  onSaveScenarioAs: (draft: ScenarioDraftData) => Promise<ScenarioFileOperationOutcome>;
  onClearFileFeedback: () => void;
  onRetrySelectedScenario: () => Promise<void>;
}

interface WorkbenchScenarioFolders {
  localFolders: ScenarioFolder[];
  folderOperation: ScenarioFolderOperation;
  folderError: ApiError | null;
  onCreateFolder: (name: string, parentId?: string) => Promise<boolean>;
  onRenameFolder: (id: string, name: string) => Promise<boolean>;
  onDeleteFolder: (id: string) => Promise<boolean>;
  onMoveFolder: (id: string, parentId: string) => Promise<boolean>;
  onReorderFolder: (id: string, siblingIndex: number) => Promise<boolean>;
  onMoveScenario: (id: string, folderId: string, siblingIndex: number) => Promise<boolean>;
  onClearFolderError: () => void;
}

export interface WorkbenchScenarioModel {
  active: LoadedScenario;
  catalog: WorkbenchScenarioCatalog;
  files: WorkbenchScenarioFiles;
  folders: WorkbenchScenarioFolders;
}

interface WorkbenchShellContext {
  workspaceSelector: ReactNode;
  connectionDialogOpen: boolean;
  onConnectionToggle: () => void;
  onNavigateHome: () => void;
}

export interface WorkbenchPageProps {
  workspaceId: string;
  connection: KafkaConnection;
  scenario: WorkbenchScenarioModel;
  emptyWorkbench?: boolean;
  shell: WorkbenchShellContext;
  onWorkspaceGuardChange: (guards: WorkspaceGuardState) => void;
}
