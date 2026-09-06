import {
  useEffect,
  useId,
  useMemo,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type {
  ApiError,
  ScenarioDescriptor,
  ScenarioFileOperation,
  ScenarioFileOperationOutcome,
  ScenarioFolder,
} from '../types';
import type { ScenarioFolderOperation } from '../useScenario';
import {
  buildScenarioTree,
  getDescendantFolderIds,
  getScenarioTreeFolderPaths,
} from '../scenarioTree';
import { readDragData, type DropTarget } from './ScenarioBrowserTree';
import type { ScenarioContextMenuState } from './ScenarioBrowserContextMenu';

export interface ScenarioBrowserProps {
  examples: ScenarioDescriptor[];
  localScenarios: ScenarioDescriptor[];
  selectedScenarioId: string | null;
  activeScenarioId: string;
  activeScenarioName: string;
  activeScenarioUnsaved?: boolean;
  scenarioLoadingId: string | null;
  scenarioCatalogLoading: boolean;
  readOnly?: boolean;
  examplesExpanded?: boolean;
  examplesDismissed?: boolean;
  onExamplesExpandedChange?: (expanded: boolean) => void;
  onExamplesDismissedChange?: (dismissed: boolean) => void;
  scenarioSelectionDisabled: boolean;
  scenarioRemovalDisabled?: boolean;
  activeScenarioDirty: boolean;
  fileOperation: ScenarioFileOperation;
  fileError: ApiError | null;
  fileErrorOperation: Exclude<ScenarioFileOperation, 'idle'> | null;
  fileActions: ReactNode;
  onSelectScenario: (id: string) => void;
  onNewScenario: () => void;
  onImportScenario: () => void;
  onRemoveScenario: (id: string) => Promise<ScenarioFileOperationOutcome>;
  localFolders?: ScenarioFolder[];
  folderOperation?: ScenarioFolderOperation;
  folderError?: ApiError | null;
  onClearFolderError?: () => void;
  onRequestCreateFolder?: (parentId?: string) => void;
  onRenameFolder?: (id: string, name: string) => Promise<boolean>;
  onDeleteFolder?: (id: string) => Promise<boolean>;
  onMoveFolder?: (id: string, parentId: string) => Promise<boolean>;
  onReorderFolder?: (id: string, siblingIndex: number) => Promise<boolean>;
  onMoveScenario?: (id: string, folderId: string, siblingIndex: number) => Promise<boolean>;
}

export function useScenarioBrowser({
  examples,
  localScenarios,
  selectedScenarioId,
  activeScenarioId,
  activeScenarioName,
  activeScenarioUnsaved = false,
  scenarioLoadingId,
  scenarioCatalogLoading,
  readOnly = false,
  examplesExpanded: controlledExamplesExpanded,
  examplesDismissed: controlledExamplesDismissed,
  onExamplesExpandedChange,
  onExamplesDismissedChange,
  scenarioSelectionDisabled,
  scenarioRemovalDisabled = false,
  activeScenarioDirty,
  fileOperation,
  fileError,
  fileErrorOperation,
  fileActions,
  onSelectScenario,
  onNewScenario,
  onImportScenario,
  onRemoveScenario,
  localFolders = [],
  folderOperation = 'idle',
  folderError = null,
  onClearFolderError = () => undefined,
  onRequestCreateFolder = () => undefined,
  onRenameFolder = () => Promise.resolve(false),
  onDeleteFolder = () => Promise.resolve(false),
  onMoveFolder = () => Promise.resolve(false),
  onReorderFolder = () => Promise.resolve(false),
  onMoveScenario = () => Promise.resolve(false),
}: ScenarioBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [internalExamplesExpanded, setInternalExamplesExpanded] = useState(true);
  const [internalExamplesDismissed, setInternalExamplesDismissed] = useState(false);
  const [localsExpanded, setLocalsExpanded] = useState(true);
  const [pendingRemoval, setPendingRemoval] = useState<ScenarioDescriptor | null>(null);
  const [scenarioGuideOpen, setScenarioGuideOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ScenarioContextMenuState | null>(null);
  const [renameFolder, setRenameFolder] = useState<ScenarioFolder | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteFolder, setDeleteFolder] = useState<ScenarioFolder | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const importDisabledDescriptionId = useId();
  const newDisabledDescriptionId = useId();
  const examplesExpanded = controlledExamplesExpanded ?? internalExamplesExpanded;
  const examplesDismissed = controlledExamplesDismissed ?? internalExamplesDismissed;
  const setExamplesExpanded = (expanded: boolean) => {
    if (controlledExamplesExpanded === undefined) setInternalExamplesExpanded(expanded);
    onExamplesExpandedChange?.(expanded);
  };
  const setExamplesDismissed = (dismissed: boolean) => {
    if (controlledExamplesDismissed === undefined) setInternalExamplesDismissed(dismissed);
    onExamplesDismissedChange?.(dismissed);
  };
  const tree = useMemo(() => buildScenarioTree(examples, searchQuery), [examples, searchQuery]);
  const localTree = useMemo(
    () => buildScenarioTree(localScenarios, searchQuery, localFolders),
    [localFolders, localScenarios, searchQuery],
  );
  const matchingLocals = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (query === '') return localScenarios;
    return localScenarios.filter((descriptor) =>
      `${descriptor.sourceFilename} ${descriptor.displayName}`.toLocaleLowerCase().includes(query),
    );
  }, [localScenarios, searchQuery]);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const [collapsedLocalFolders, setCollapsedLocalFolders] = useState<Set<string>>(() => new Set());
  const searchActive = searchQuery.trim() !== '';
  const expandedFolders = useMemo(() => {
    const availableFolders = getScenarioTreeFolderPaths(tree);
    if (searchActive) return availableFolders;

    for (const folderPath of collapsedFolders) availableFolders.delete(folderPath);
    return availableFolders;
  }, [collapsedFolders, searchActive, tree]);
  const expandedLocalFolders = useMemo(() => {
    const availableFolders = getScenarioTreeFolderPaths(localTree);
    if (searchActive) return availableFolders;
    for (const folderId of collapsedLocalFolders) availableFolders.delete(folderId);
    return availableFolders;
  }, [collapsedLocalFolders, localTree, searchActive]);
  useEffect(() => {
    if (contextMenu === null) return;
    const close = () => setContextMenu(null);
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu]);
  const fileBusy = fileOperation !== 'idle';
  const interactionDisabled = scenarioSelectionDisabled || readOnly;
  const hideExamplesDisabled =
    readOnly ||
    scenarioSelectionDisabled ||
    fileBusy ||
    scenarioCatalogLoading ||
    scenarioLoadingId !== null ||
    activeScenarioDirty;
  const hideExamplesDisabledReason = readOnly
    ? 'Return to the current workspace to edit scenarios'
    : scenarioSelectionDisabled
      ? 'Finish the active run before hiding examples'
      : fileBusy
        ? 'Wait for the current scenario file operation to finish'
        : scenarioCatalogLoading
          ? 'Wait for examples to finish loading'
          : scenarioLoadingId !== null
            ? 'Wait for the selected scenario to finish loading'
            : 'Save or discard changes before hiding examples';
  const restoreExamplesDisabled =
    readOnly ||
    scenarioSelectionDisabled ||
    fileBusy ||
    scenarioCatalogLoading ||
    scenarioLoadingId !== null;
  const restoreExamplesDisabledReason = readOnly
    ? 'Return to the current workspace to edit scenarios'
    : scenarioSelectionDisabled
      ? 'Finish the active run before restoring examples'
      : fileBusy
        ? 'Wait for the current scenario file operation to finish'
        : scenarioCatalogLoading
          ? 'Wait for examples to finish loading'
          : 'Wait for the selected scenario to finish loading';
  const importDisabled =
    interactionDisabled || fileBusy || scenarioCatalogLoading || scenarioLoadingId !== null;
  const replacementDisabledReason = readOnly
    ? 'Return to the current workspace to edit scenarios'
    : scenarioSelectionDisabled
      ? 'Finish the active run before replacing the current scenario'
      : fileBusy
        ? 'Wait for the current scenario file operation to finish'
        : scenarioCatalogLoading
          ? 'Wait for scenarios to finish loading'
          : scenarioLoadingId !== null
            ? 'Wait for the selected scenario to finish loading'
            : '';
  const importDisabledReason = replacementDisabledReason.replace(
    'replacing the current scenario',
    'importing another scenario',
  );

  const requestRemove = (descriptor: ScenarioDescriptor) => {
    if (
      interactionDisabled ||
      fileBusy ||
      scenarioRemovalDisabled ||
      (descriptor.id === activeScenarioId && activeScenarioDirty)
    ) {
      return;
    }
    setPendingRemoval(descriptor);
  };

  const confirmRemove = () => {
    const descriptor = pendingRemoval;
    if (descriptor === null) return;
    setPendingRemoval(null);
    void onRemoveScenario(descriptor.id);
  };

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };

  const toggleLocalFolder = (folderId: string) => {
    setCollapsedLocalFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const openContextMenu = (
    event: MouseEvent,
    item: { kind: 'folder' | 'scenario' | 'root'; id: string },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, ...item });
  };

  const beginFolderRename = (folder: ScenarioFolder) => {
    setContextMenu(null);
    onClearFolderError();
    setRenameFolder(folder);
    setRenameValue(folder.name);
  };

  const confirmFolderRename = async () => {
    if (renameFolder !== null && (await onRenameFolder(renameFolder.id, renameValue))) {
      setRenameFolder(null);
    }
  };

  const closeRenameFolder = () => {
    if (folderOperation === 'idle') {
      onClearFolderError();
      setRenameFolder(null);
    }
  };

  const folderScenarioCount = (folderId: string): number => {
    const descendants = getDescendantFolderIds(localFolders, folderId);
    return localScenarios.filter((scenario) => descendants.has(scenario.folderId ?? '')).length;
  };

  const folderContainsActiveScenario = (folderId: string): boolean => {
    const descendants = getDescendantFolderIds(localFolders, folderId);
    const active = localScenarios.find((scenario) => scenario.id === activeScenarioId);
    return active !== undefined && descendants.has(active.folderId ?? '');
  };

  const rootDropEnabled =
    !searchActive &&
    !readOnly &&
    !interactionDisabled &&
    !fileBusy &&
    !scenarioCatalogLoading &&
    scenarioLoadingId === null &&
    folderOperation === 'idle';
  const handleRootDrop = (event: DragEvent<HTMLDivElement>) => {
    if (
      !rootDropEnabled ||
      (event.target instanceof Element && event.target.closest('.scenario-folder-content') !== null)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const drag = readDragData(event);
    if (drag?.kind === 'folder') void onMoveFolder(drag.id, '');
    if (drag?.kind === 'scenario') void onMoveScenario(drag.id, '', localTree.scenarios.length);
  };
  const handleRootDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (
      !rootDropEnabled ||
      (event.target instanceof Element && event.target.closest('.scenario-folder-content') !== null)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setDropTarget({ kind: 'root', id: '', position: 'inside' });
  };
  const handleLocalRootDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!rootDropEnabled) return;
    setDropTarget(null);
    handleRootDrop(event);
  };

  const folderMenuDisabled =
    readOnly || scenarioSelectionDisabled || fileBusy || folderOperation !== 'idle';
  const scenarioMenuDisabled = folderMenuDisabled || scenarioRemovalDisabled;

  const confirmDeleteFolder = async () => {
    if (deleteFolder !== null && (await onDeleteFolder(deleteFolder.id))) setDeleteFolder(null);
  };
  const closeDeleteFolder = () => {
    if (folderOperation === 'idle') {
      onClearFolderError();
      setDeleteFolder(null);
    }
  };

  return {
    localScenarios,
    selectedScenarioId,
    activeScenarioId,
    activeScenarioName,
    activeScenarioUnsaved,
    scenarioLoadingId,
    scenarioCatalogLoading,
    readOnly,
    activeScenarioDirty,
    fileOperation,
    fileError,
    fileErrorOperation,
    fileActions,
    onSelectScenario,
    onNewScenario,
    onImportScenario,
    onRemoveScenario,
    localFolders,
    folderOperation,
    folderError,
    onClearFolderError,
    onRequestCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onMoveFolder,
    onReorderFolder,
    onMoveScenario,
    searchQuery,
    setSearchQuery,
    localsExpanded,
    setLocalsExpanded,
    pendingRemoval,
    setPendingRemoval,
    scenarioGuideOpen,
    setScenarioGuideOpen,
    contextMenu,
    setContextMenu,
    renameFolder,
    renameValue,
    setRenameValue,
    deleteFolder,
    setDeleteFolder,
    dropTarget,
    setDropTarget,
    importDisabledDescriptionId,
    newDisabledDescriptionId,
    examplesExpanded,
    examplesDismissed,
    setExamplesExpanded,
    setExamplesDismissed,
    tree,
    localTree,
    matchingLocals,
    searchActive,
    expandedFolders,
    expandedLocalFolders,
    fileBusy,
    interactionDisabled,
    hideExamplesDisabled,
    hideExamplesDisabledReason,
    restoreExamplesDisabled,
    restoreExamplesDisabledReason,
    importDisabled,
    replacementDisabledReason,
    importDisabledReason,
    requestRemove,
    confirmRemove,
    toggleFolder,
    toggleLocalFolder,
    openContextMenu,
    beginFolderRename,
    confirmFolderRename,
    closeRenameFolder,
    folderScenarioCount,
    folderContainsActiveScenario,
    handleRootDragOver,
    handleLocalRootDrop,
    folderMenuDisabled,
    scenarioMenuDisabled,
    confirmDeleteFolder,
    closeDeleteFolder,
  };
}
