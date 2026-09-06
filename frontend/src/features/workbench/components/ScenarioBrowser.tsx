import type { ReactNode } from 'react';
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
import { LocalScenarioTree, ScenarioRows } from './ScenarioBrowserTree';
import { ScenarioBrowserContextMenu } from './ScenarioBrowserContextMenu';
import { ScenarioFolderDialogs } from './ScenarioFolderDialogs';
import { useScenarioBrowser, type ScenarioBrowserProps } from './useScenarioBrowser';

export { ScenarioRows } from './ScenarioBrowserTree';

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

export function ScenarioBrowser(props: ScenarioBrowserProps) {
  const {
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
    localFolders,
    folderOperation,
    folderError,
    onClearFolderError,
    onRequestCreateFolder,
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
  } = useScenarioBrowser(props);

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
