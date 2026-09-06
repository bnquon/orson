import { useCallback, useState, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { api } from '../../../wailsjs/go/models';
import type { ApiError } from '../../api/result';
import type {
  ScenarioDescriptor,
  ScenarioDiagnostic,
  ScenarioFolder,
  ScenarioFolderFeedback,
} from './types';
import type { ScenarioFolderOperation } from './useScenario';
import { toScenarioDescriptor } from './scenarioMapping';
import {
  createScenarioFolder,
  deleteScenarioFolder,
  moveLocalScenario,
  moveScenarioFolder,
  reorderScenarioFolder,
  renameScenarioFolder,
} from '../../api/scenarioFolders';

interface ScenarioFolderOptions {
  mountedRef: RefObject<boolean>;
  activeScenarioIdRef: RefObject<string | null>;
  localDescriptorsRef: RefObject<ScenarioDescriptor[]>;
  selectedScenarioId: string | null;
  setSelectedScenarioId: Dispatch<SetStateAction<string | null>>;
  setSelectedDiagnostics: Dispatch<SetStateAction<ScenarioDiagnostic[]>>;
  setSelectedLoadStatus: Dispatch<SetStateAction<'idle' | 'loading' | 'failed'>>;
  setSelectedLoadError: Dispatch<SetStateAction<ApiError | null>>;
  replaceLocalDescriptors: (descriptors: ScenarioDescriptor[]) => void;
  clearScenarioSelection: (showBlankWorkbench: boolean) => void;
  onPersistence: (status: api.WorkspacePersistenceStatus | undefined) => void;
}

function folderDeletionMessage(summary: api.FolderMutationSummary | undefined): string {
  if (summary === undefined) return 'Folder deleted';

  const removedScenarioCount = summary.removedScenarioCount ?? 0;
  const scenarioLabel = removedScenarioCount === 1 ? 'scenario' : 'scenarios';
  return `Folder deleted. ${removedScenarioCount} ${scenarioLabel} removed.`;
}

export function useScenarioFolders({
  mountedRef,
  activeScenarioIdRef,
  localDescriptorsRef,
  selectedScenarioId,
  setSelectedScenarioId,
  setSelectedDiagnostics,
  setSelectedLoadStatus,
  setSelectedLoadError,
  replaceLocalDescriptors,
  clearScenarioSelection,
  onPersistence,
}: ScenarioFolderOptions) {
  const [localFolders, setLocalFolders] = useState<ScenarioFolder[]>([]);
  const [folderOperation, setFolderOperation] = useState<ScenarioFolderOperation>('idle');
  const [folderError, setFolderError] = useState<ApiError | null>(null);
  const [folderFeedback, setFolderFeedback] = useState<ScenarioFolderFeedback>({
    successMessage: null,
  });
  const applyFolderData = useCallback(
    (data: api.ScenarioFolderData) => {
      setLocalFolders(
        (data.folders ?? []).map((folder) => ({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId ?? '',
          siblingOrder: folder.siblingOrder ?? 0,
        })),
      );
      replaceLocalDescriptors((data.scenarios ?? []).map(toScenarioDescriptor));
    },
    [replaceLocalDescriptors],
  );

  const runFolderOperation = useCallback(
    async (
      operation: Exclude<ScenarioFolderOperation, 'idle'>,
      request: () => ReturnType<typeof createScenarioFolder>,
    ) => {
      setFolderOperation(operation);
      setFolderError(null);
      setFolderFeedback({ successMessage: null });
      const activeIdBeforeOperation = activeScenarioIdRef.current;
      const activeWasLocal =
        activeIdBeforeOperation !== null &&
        localDescriptorsRef.current.some((item) => item.id === activeIdBeforeOperation);
      const selectedIdBeforeOperation = selectedScenarioId;
      const selectedWasLocal =
        selectedIdBeforeOperation !== null &&
        localDescriptorsRef.current.some((item) => item.id === selectedIdBeforeOperation);
      const result = await request();
      if (!mountedRef.current) return false;
      if (result.data !== undefined) applyFolderData(result.data);
      if (result.data?.persistence !== undefined) onPersistence(result.data.persistence);
      if (operation === 'deleting' && result.data !== undefined) {
        const remainingScenarioIds = new Set(result.data.scenarios.map((item) => item.id));
        const activeWasRemoved =
          activeWasLocal &&
          activeIdBeforeOperation !== null &&
          !remainingScenarioIds.has(activeIdBeforeOperation);
        const selectedWasRemoved =
          selectedWasLocal &&
          selectedIdBeforeOperation !== null &&
          !remainingScenarioIds.has(selectedIdBeforeOperation);

        if (activeWasRemoved) {
          clearScenarioSelection(true);
        } else if (selectedWasRemoved) {
          setSelectedScenarioId(null);
          setSelectedDiagnostics([]);
          setSelectedLoadStatus('idle');
          setSelectedLoadError(null);
        }
        if (result.ok) {
          setFolderFeedback({
            successMessage: folderDeletionMessage(result.data.summary),
          });
        }
      }
      if (!result.ok) {
        setFolderError(result.error);
        setFolderOperation('idle');
        return false;
      }
      setFolderError(null);
      setFolderOperation('idle');
      return true;
    },
    [
      activeScenarioIdRef,
      applyFolderData,
      clearScenarioSelection,
      localDescriptorsRef,
      mountedRef,
      onPersistence,
      selectedScenarioId,
      setSelectedDiagnostics,
      setSelectedLoadError,
      setSelectedLoadStatus,
      setSelectedScenarioId,
    ],
  );

  const createFolder = useCallback(
    (name: string, parentId = '') =>
      runFolderOperation('creating', () => createScenarioFolder(name, parentId)),
    [runFolderOperation],
  );
  const renameFolder = useCallback(
    (id: string, name: string) =>
      runFolderOperation('renaming', () => renameScenarioFolder(id, name)),
    [runFolderOperation],
  );
  const moveFolder = useCallback(
    (id: string, parentId: string) =>
      runFolderOperation('moving', () => moveScenarioFolder(id, parentId)),
    [runFolderOperation],
  );
  const reorderFolder = useCallback(
    (id: string, siblingIndex: number) =>
      runFolderOperation('moving', () => reorderScenarioFolder(id, siblingIndex)),
    [runFolderOperation],
  );
  const moveScenario = useCallback(
    (id: string, folderId: string, siblingIndex: number) =>
      runFolderOperation('moving', () => moveLocalScenario(id, folderId, siblingIndex)),
    [runFolderOperation],
  );
  const deleteFolder = useCallback(
    (id: string) => runFolderOperation('deleting', () => deleteScenarioFolder(id)),
    [runFolderOperation],
  );

  return {
    localFolders,
    setLocalFolders,
    folderOperation,
    folderError,
    setFolderError,
    folderFeedback,
    setFolderFeedback,
    createFolder,
    renameFolder,
    moveFolder,
    reorderFolder,
    moveScenario,
    deleteFolder,
  };
}
