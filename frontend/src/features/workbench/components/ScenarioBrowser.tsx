import {
  useEffect,
  useId,
  useMemo,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  EmptyPage,
  FolderPlus,
  InfoCircle,
  MoreHoriz,
  NavArrowDown,
  PagePlus,
  Plus,
  Search,
  Xmark,
} from 'iconoir-react';
import { LoadingDots } from '../../../components/LoadingDots';
import { Modal, ModalActions, ModalButton } from '../../../components/Modal';
import '../styles/scenario.css';
import { ScenarioGuideModal } from './ScenarioGuideModal';
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
import {
  LocalScenarioTree,
  readDragData,
  ScenarioRows,
  type DropTarget,
} from './ScenarioBrowserTree';
import {
  ScenarioBrowserContextMenu,
  type ScenarioContextMenuState,
} from './ScenarioBrowserContextMenu';
import { ScenarioFolderDialogs } from './ScenarioFolderDialogs';

export { ScenarioRows } from './ScenarioBrowserTree';

interface ScenarioBrowserProps {
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

interface SectionLabelProps {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  onDismiss?: () => void;
  dismissDisabled?: boolean;
  dismissDisabledReason?: string;
}

function SectionLabel({
  label,
  expanded,
  onToggle,
  actions,
  onDismiss,
  dismissDisabled = false,
  dismissDisabledReason,
}: SectionLabelProps) {
  return (
    <div className="scenario-sidebar__label">
      <button type="button" className="scenario-section-toggle" onClick={onToggle}>
        <NavArrowDown
          className={expanded ? '' : 'scenario-section-toggle__chevron--collapsed'}
          width={14}
          height={14}
        />
        <span>{label}</span>
      </button>
      <div className="scenario-section-label-actions">
        {actions}
        {onDismiss ? (
          <button
            type="button"
            className="scenario-section-dismiss"
            aria-label={`Hide ${label}`}
            disabled={dismissDisabled}
            title={dismissDisabled ? dismissDisabledReason : `Hide ${label} for this session`}
            onClick={onDismiss}
          >
            <Xmark width={13} height={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ScenarioBrowser({
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

  return (
    <>
      {contextMenu ? (
        <ScenarioBrowserContextMenu
          contextMenu={contextMenu}
          localFolders={localFolders}
          localScenarios={localScenarios}
          activeScenarioId={activeScenarioId}
          activeScenarioDirty={activeScenarioDirty}
          folderMenuDisabled={folderMenuDisabled}
          scenarioMenuDisabled={scenarioMenuDisabled}
          folderContainsActiveScenario={folderContainsActiveScenario}
          onClose={() => setContextMenu(null)}
          onRequestCreateFolder={onRequestCreateFolder}
          onRenameFolder={beginFolderRename}
          onDeleteFolder={(folder) => {
            setContextMenu(null);
            onClearFolderError();
            setDeleteFolder(folder);
          }}
          onMoveScenario={(id, folderId, siblingIndex) => {
            setContextMenu(null);
            void onMoveScenario(id, folderId, siblingIndex);
          }}
          onRemoveScenario={(descriptor) => {
            setContextMenu(null);
            requestRemove(descriptor);
          }}
        />
      ) : null}
      <aside className="scenario-sidebar" aria-label="Scenario browser">
        <div className="scenario-sidebar__header">
          <div className="scenario-sidebar__title">
            <strong>Scenarios</strong>
            <div className="scenario-sidebar__title-actions">
              <button
                className="scenario-guide-button"
                type="button"
                aria-label="Scenario format guide"
                aria-haspopup="dialog"
                title="Learn the scenario YAML format"
                onClick={() => setScenarioGuideOpen(true)}
              >
                <InfoCircle width={15} height={15} aria-hidden="true" />
              </button>
              <MoreHoriz width={16} height={16} aria-hidden="true" />
            </div>
          </div>
          <label className="scenario-search">
            <Search width={16} height={16} />
            <span className="sr-only">Filter scenarios</span>
            <input
              type="search"
              placeholder="Filter scenarios"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
          {readOnly ? (
            <span className="scenario-sidebar__readonly">Historical view · editing disabled</span>
          ) : null}
          {activeScenarioUnsaved ? (
            <div className="scenario-sidebar__unsaved" role="status">
              <EmptyPage width={14} height={14} aria-hidden="true" />
              <span>{activeScenarioName}</span>
              <small>Unsaved</small>
            </div>
          ) : null}
          {folderError && renameFolder === null && deleteFolder === null ? (
            <div className="scenario-folder-error" role="alert">
              <span>{folderError.message}</span>
              <button type="button" aria-label="Dismiss folder error" onClick={onClearFolderError}>
                <Xmark width={13} height={13} />
              </button>
            </div>
          ) : null}
        </div>

        <div className="scenario-sidebar__scroll">
          {examplesDismissed ? (
            <button
              className="scenario-examples-restore"
              type="button"
              disabled={restoreExamplesDisabled}
              title={restoreExamplesDisabled ? restoreExamplesDisabledReason : undefined}
              onClick={() => setExamplesDismissed(false)}
            >
              Examples hidden <span>Restore</span>
            </button>
          ) : (
            <section aria-label="Examples">
              <SectionLabel
                label="Examples"
                expanded={examplesExpanded}
                onToggle={() => setExamplesExpanded(!examplesExpanded)}
                onDismiss={() => setExamplesDismissed(true)}
                dismissDisabled={hideExamplesDisabled}
                dismissDisabledReason={hideExamplesDisabledReason}
              />
              {examplesExpanded ? (
                scenarioCatalogLoading ? (
                  <div className="scenario-sidebar__state" role="status" aria-busy="true">
                    <LoadingDots size="inline" /> Discovering examples…
                  </div>
                ) : tree.folders.length === 0 && tree.scenarios.length === 0 ? (
                  <div className="scenario-sidebar__state">No matching examples.</div>
                ) : (
                  <ScenarioRows
                    folders={tree.folders}
                    scenarios={tree.scenarios}
                    expandedFolders={expandedFolders}
                    selectedScenarioId={selectedScenarioId}
                    activeScenarioId={activeScenarioId}
                    scenarioLoadingId={scenarioLoadingId}
                    selectionDisabled={interactionDisabled || fileBusy || scenarioCatalogLoading}
                    onToggleFolder={toggleFolder}
                    onSelectScenario={onSelectScenario}
                    folderToggleDisabled={searchActive}
                  />
                )
              ) : null}
            </section>
          )}

          <section
            className="scenario-sidebar__local-section"
            aria-label="My scenarios"
            onContextMenu={(event) => openContextMenu(event, { kind: 'root', id: '' })}
          >
            <SectionLabel
              label="My scenarios"
              expanded={localsExpanded}
              onToggle={() => setLocalsExpanded((expanded) => !expanded)}
              actions={
                <>
                  <button
                    className="scenario-section-action"
                    type="button"
                    aria-label="New folder"
                    title={folderMenuDisabled ? 'Finish the current operation first' : 'New folder'}
                    disabled={folderMenuDisabled}
                    onClick={() => onRequestCreateFolder()}
                  >
                    <FolderPlus width={14} height={14} />
                  </button>
                  <button
                    className="scenario-section-action"
                    type="button"
                    aria-label="New scenario"
                    title={importDisabled ? importDisabledReason : 'New scenario'}
                    disabled={importDisabled}
                    onClick={onNewScenario}
                  >
                    <PagePlus width={14} height={14} />
                  </button>
                </>
              }
            />
            {localsExpanded ? (
              <div
                className={`scenario-local-scenarios-area ${dropTarget?.kind === 'root' ? 'scenario-local-scenarios-area--drop-target' : ''}`}
                onDragOver={handleRootDragOver}
                onDrop={handleLocalRootDrop}
              >
                {localTree.folders.length > 0 || localTree.scenarios.length > 0 ? (
                  <LocalScenarioTree
                    folders={localTree.folders}
                    scenarios={localTree.scenarios}
                    expandedFolders={expandedLocalFolders}
                    localFolderRecords={localFolders}
                    state={{
                      selectedScenarioId,
                      activeScenarioId,
                      scenarioLoadingId,
                      selectionDisabled: interactionDisabled || fileBusy || scenarioCatalogLoading,
                      readOnly,
                      activeScenarioDirty,
                      saveErrorScenarioId:
                        fileError !== null &&
                        (fileErrorOperation === 'saving' || fileErrorOperation === 'saving_as')
                          ? activeScenarioId
                          : null,
                      searchActive,
                      folderOperation,
                    }}
                    actions={{
                      onToggleFolder: toggleLocalFolder,
                      onSelectScenario,
                      onContextMenu: openContextMenu,
                      onMoveFolder,
                      onReorderFolder,
                      onMoveScenario,
                      onDropTargetChange: setDropTarget,
                    }}
                    dropTarget={dropTarget}
                  />
                ) : null}
                {matchingLocals.length === 0 ? (
                  <div className="scenario-sidebar__empty-local">
                    <span>
                      {searchActive && localScenarios.length > 0
                        ? 'No matching local files.'
                        : 'No local scenarios yet. Import a YAML file below to add one for this session.'}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>

        <div className="scenario-sidebar__footer">
          <div className="scenario-sidebar__file-actions">{fileActions}</div>
          <span
            className="scenario-disabled-action"
            tabIndex={importDisabled ? 0 : undefined}
            aria-label={importDisabled ? replacementDisabledReason : undefined}
            title={importDisabled ? replacementDisabledReason : undefined}
          >
            <button
              className="scenario-import-button"
              type="button"
              disabled={importDisabled}
              aria-describedby={importDisabled ? newDisabledDescriptionId : undefined}
              title={importDisabled ? undefined : 'Start a new unsaved scenario'}
              onClick={onNewScenario}
            >
              <EmptyPage width={15} height={15} /> New scenario
            </button>
            {importDisabled ? (
              <span className="sr-only" id={newDisabledDescriptionId}>
                {replacementDisabledReason}
              </span>
            ) : null}
          </span>
          <span
            className="scenario-disabled-action"
            tabIndex={importDisabled ? 0 : undefined}
            aria-label={importDisabled ? importDisabledReason : undefined}
            title={importDisabled ? importDisabledReason : undefined}
          >
            <button
              className="scenario-import-button"
              type="button"
              disabled={importDisabled}
              aria-describedby={importDisabled ? importDisabledDescriptionId : undefined}
              title={importDisabled ? undefined : 'Choose a YAML file from your computer'}
              onClick={onImportScenario}
            >
              {fileOperation === 'importing' ? (
                <>
                  <LoadingDots size="inline" /> Importing YAML…
                </>
              ) : (
                <>
                  <Plus width={15} height={15} /> Import YAML
                </>
              )}
            </button>
            {importDisabled ? (
              <span className="sr-only" id={importDisabledDescriptionId}>
                {importDisabledReason}
              </span>
            ) : null}
          </span>
        </div>
      </aside>
      <Modal
        open={pendingRemoval !== null}
        title="Remove scenario import?"
        description="This removes the scenario from the current workspace. The YAML file on disk will not be deleted or modified."
        onClose={() => setPendingRemoval(null)}
        footer={
          <ModalActions>
            <ModalButton type="button" onClick={() => setPendingRemoval(null)}>
              Cancel
            </ModalButton>
            <ModalButton tone="danger" type="button" onClick={confirmRemove}>
              Remove from workspace
            </ModalButton>
          </ModalActions>
        }
      >
        <p className="scenario-switch-copy">
          <strong>{pendingRemoval?.sourceFilename}</strong> will no longer appear in this workspace.
          You can import the same YAML file again later.
        </p>
      </Modal>
      {scenarioGuideOpen ? (
        <ScenarioGuideModal open onClose={() => setScenarioGuideOpen(false)} />
      ) : null}
      <ScenarioFolderDialogs
        renameFolder={renameFolder}
        renameValue={renameValue}
        folderError={folderError}
        folderOperation={folderOperation}
        deleteFolder={deleteFolder}
        folderScenarioCount={folderScenarioCount}
        onRenameValueChange={setRenameValue}
        onConfirmRename={() => void confirmFolderRename()}
        onCloseRename={closeRenameFolder}
        onConfirmDelete={() => void confirmDeleteFolder()}
        onCloseDelete={closeDeleteFolder}
      />
    </>
  );
}
