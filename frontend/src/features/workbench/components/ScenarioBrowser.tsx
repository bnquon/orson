import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  CheckCircle,
  EmptyPage,
  MoreHoriz,
  NavArrowDown,
  Plus,
  Search,
  WarningCircle,
  Xmark,
} from 'iconoir-react';
import { LoadingDots } from '../../../components/LoadingDots';
import { Modal, ModalActions, ModalButton } from '../../../components/Modal';
import type {
  ApiError,
  ScenarioDescriptor,
  ScenarioFileOperation,
  ScenarioFileOperationOutcome,
} from '../types';
import {
  buildScenarioTree,
  getScenarioTreeFolderPaths,
  type ScenarioTreeFolder,
} from '../scenarioTree';

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
  activeScenarioDirty: boolean;
  fileOperation: ScenarioFileOperation;
  fileError: ApiError | null;
  fileErrorOperation: Exclude<ScenarioFileOperation, 'idle'> | null;
  fileActions: ReactNode;
  onSelectScenario: (id: string) => void;
  onNewScenario: () => void;
  onImportScenario: () => void;
  onRemoveScenario: (id: string) => Promise<ScenarioFileOperationOutcome>;
}

function ScenarioStatusMark({ descriptor }: { descriptor: ScenarioDescriptor }) {
  if (
    descriptor.status === 'invalid' ||
    descriptor.status === 'valid_with_warnings' ||
    (descriptor.source === 'local' && descriptor.localStatus !== 'available')
  ) {
    return (
      <WarningCircle
        className={
          descriptor.source === 'local' && descriptor.localStatus !== 'available'
            ? 'scenario-row__status-icon--error'
            : undefined
        }
        width={14}
        height={14}
        aria-hidden="true"
      />
    );
  }
  return <CheckCircle width={14} height={14} aria-hidden="true" />;
}

function statusLabel(descriptor: ScenarioDescriptor): string {
  if (descriptor.localStatus === 'changed') return 'File changed outside Orson';
  if (descriptor.localStatus === 'missing') return 'File is missing';
  if (descriptor.localStatus === 'unreadable') return 'File cannot be read';
  if (descriptor.status === 'invalid') return 'Invalid scenario';
  if (descriptor.status === 'valid_with_warnings') {
    return `${descriptor.warnings.length} scenario warning${descriptor.warnings.length === 1 ? '' : 's'}`;
  }
  return 'Valid scenario';
}

function statusTone(descriptor: ScenarioDescriptor): 'valid' | 'warning' | 'invalid' {
  if (descriptor.status === 'invalid') return 'invalid';
  if (
    descriptor.status === 'valid_with_warnings' ||
    (descriptor.source === 'local' && descriptor.localStatus !== 'available')
  ) {
    return 'warning';
  }
  return 'valid';
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="scenario-row__folder-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 640"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d={
          open
            ? 'M129.5 464L179.5 304L558.9 304L508.9 464L129.5 464zM320.2 512L509 512C530 512 548.6 498.4 554.8 478.3L604.8 318.3C614.5 287.4 591.4 256 559 256L179.6 256C158.6 256 140 269.6 133.8 289.7L112.2 358.4L112.2 160C112.2 151.2 119.4 144 128.2 144L266.9 144C270.4 144 273.7 145.1 276.5 147.2L314.9 176C328.7 186.4 345.6 192 362.9 192L480.2 192C489 192 496.2 199.2 496.2 208L544.2 208C544.2 172.7 515.5 144 480.2 144L362.9 144C356 144 349.2 141.8 343.7 137.6L305.3 108.8C294.2 100.5 280.8 96 266.9 96L128.2 96C92.9 96 64.2 124.7 64.2 160L64.2 448C64.2 483.3 92.9 512 128.2 512L320.2 512z'
            : 'M128 464L512 464C520.8 464 528 456.8 528 448L528 208C528 199.2 520.8 192 512 192L362.7 192C345.4 192 328.5 186.4 314.7 176L276.3 147.2C273.5 145.1 270.2 144 266.7 144L128 144C119.2 144 112 151.2 112 160L112 448C112 456.8 119.2 464 128 464zM512 512L128 512C92.7 512 64 483.3 64 448L64 160C64 124.7 92.7 96 128 96L266.7 96C280.5 96 294 100.5 305.1 108.8L343.5 137.6C349 141.8 355.8 144 362.7 144L512 144C547.3 144 576 172.7 576 208L576 448C576 483.3 547.3 512 512 512z'
        }
      />
    </svg>
  );
}

interface ScenarioRowsProps {
  folders: ScenarioTreeFolder[];
  scenarios: ScenarioDescriptor[];
  expandedFolders: Set<string>;
  selectedScenarioId: string | null;
  activeScenarioId: string;
  scenarioLoadingId: string | null;
  selectionDisabled: boolean;
  onToggleFolder: (path: string) => void;
  onSelectScenario: (id: string) => void;
  folderToggleDisabled?: boolean;
  depth?: number;
  visible?: boolean;
}

export function ScenarioRows({
  folders,
  scenarios,
  expandedFolders,
  selectedScenarioId,
  activeScenarioId,
  scenarioLoadingId,
  selectionDisabled,
  onToggleFolder,
  onSelectScenario,
  folderToggleDisabled = false,
  depth = 0,
  visible = true,
}: ScenarioRowsProps) {
  return (
    <>
      {scenarios.map((descriptor) => {
        const isActive = descriptor.id === activeScenarioId;
        const isSelected = descriptor.id === selectedScenarioId;
        const isSelectedInvalid = isSelected && descriptor.status === 'invalid';
        const disabled = selectionDisabled || scenarioLoadingId !== null;
        return (
          <button
            className={`scenario-row scenario-row--scenario ${isActive ? 'scenario-row--active' : ''} ${isSelected && !isActive ? 'scenario-row--selected' : ''} ${isSelectedInvalid ? 'scenario-row--invalid-selected' : ''}`}
            type="button"
            key={descriptor.id}
            style={{ paddingLeft: `${26 + depth * 14}px` }}
            tabIndex={visible ? undefined : -1}
            aria-current={isActive ? 'page' : undefined}
            aria-label={`${descriptor.displayName}, read-only example, ${statusLabel(descriptor)}${isActive ? ', active' : ''}`}
            title={`${descriptor.relativePath} · Read-only example · ${statusLabel(descriptor)}`}
            disabled={disabled}
            onClick={() => onSelectScenario(descriptor.id)}
          >
            <span className="scenario-row__kind">YAML</span>
            <span className="scenario-row__name">{descriptor.displayName}</span>
            <span
              className={`scenario-row__status scenario-row__status--${statusTone(descriptor)}`}
              aria-label={statusLabel(descriptor)}
            >
              {scenarioLoadingId === descriptor.id ? (
                <LoadingDots size="inline" />
              ) : (
                <ScenarioStatusMark descriptor={descriptor} />
              )}
            </span>
          </button>
        );
      })}
      {folders.map((folder) => {
        const expanded = expandedFolders.has(folder.path);
        const folderId = `scenario-folder-${folder.path.replaceAll('/', '-')}`;
        const descendantsVisible = visible && expanded;
        return (
          <div key={folder.path} className="scenario-folder">
            <button
              className="scenario-row scenario-row--folder"
              type="button"
              disabled={folderToggleDisabled}
              tabIndex={visible ? undefined : -1}
              aria-expanded={expanded}
              aria-controls={folderId}
              style={{ paddingLeft: `${9 + depth * 14}px` }}
              onClick={() => onToggleFolder(folder.path)}
            >
              <span
                className={`scenario-row__chevron ${expanded ? 'scenario-row__chevron--expanded' : ''}`}
                aria-hidden="true"
              >
                <NavArrowDown width={16} height={16} />
              </span>
              <FolderIcon open={expanded} />
              <span className="scenario-row__name">{folder.name}</span>
            </button>
            <div
              className={`scenario-folder-content ${expanded ? 'scenario-folder-content--expanded' : ''}`}
              id={folderId}
              aria-hidden={!expanded}
            >
              <div className="scenario-folder-content__inner">
                <ScenarioRows
                  folders={folder.folders}
                  scenarios={folder.scenarios}
                  expandedFolders={expandedFolders}
                  selectedScenarioId={selectedScenarioId}
                  activeScenarioId={activeScenarioId}
                  scenarioLoadingId={scenarioLoadingId}
                  selectionDisabled={selectionDisabled}
                  onToggleFolder={onToggleFolder}
                  onSelectScenario={onSelectScenario}
                  folderToggleDisabled={folderToggleDisabled}
                  depth={depth + 1}
                  visible={descendantsVisible}
                />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

interface SectionLabelProps {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onDismiss?: () => void;
}

function SectionLabel({ label, count, expanded, onToggle, onDismiss }: SectionLabelProps) {
  return (
    <div className="scenario-sidebar__label">
      <button type="button" className="scenario-section-toggle" onClick={onToggle}>
        <NavArrowDown
          className={expanded ? '' : 'scenario-section-toggle__chevron--collapsed'}
          width={14}
          height={14}
        />
        <span>{label}</span>
        <span className="scenario-row__count">{count}</span>
      </button>
      {onDismiss ? (
        <button
          type="button"
          className="scenario-section-dismiss"
          aria-label={`Hide ${label}`}
          title={`Hide ${label} for this session`}
          onClick={onDismiss}
        >
          <Xmark width={13} height={13} />
        </button>
      ) : null}
    </div>
  );
}

function LocalScenarioRow({
  descriptor,
  selectedScenarioId,
  activeScenarioId,
  scenarioLoadingId,
  selectionDisabled,
  activeScenarioDirty,
  hasSaveError,
  onSelectScenario,
  onRemoveScenarioRequest,
}: {
  descriptor: ScenarioDescriptor;
  selectedScenarioId: string | null;
  activeScenarioId: string;
  scenarioLoadingId: string | null;
  selectionDisabled: boolean;
  activeScenarioDirty: boolean;
  hasSaveError: boolean;
  onSelectScenario: (id: string) => void;
  onRemoveScenarioRequest: (descriptor: ScenarioDescriptor) => void;
}) {
  const isActive = descriptor.id === activeScenarioId;
  const isSelected = descriptor.id === selectedScenarioId;
  const rowStatus = hasSaveError
    ? 'Save failed'
    : isActive && activeScenarioDirty
      ? 'Unsaved changes'
      : statusLabel(descriptor);
  const disabled = selectionDisabled || scenarioLoadingId !== null;
  const removeDisabled = disabled || (isActive && activeScenarioDirty);
  return (
    <div className="scenario-row__local-wrapper">
      <button
        className={`scenario-row scenario-row--scenario scenario-row--local ${isActive ? 'scenario-row--active' : ''} ${isSelected && !isActive ? 'scenario-row--selected' : ''} ${descriptor.status === 'invalid' && isSelected ? 'scenario-row--invalid-selected' : ''} ${hasSaveError ? 'scenario-row--save-error' : ''}`}
        type="button"
        aria-current={isActive ? 'page' : undefined}
        aria-label={`${descriptor.sourceFilename}, local file, ${rowStatus}${isActive ? ', active' : ''}`}
        title={`${descriptor.sourcePath || descriptor.sourceFilename} · ${rowStatus}`}
        disabled={disabled}
        onClick={() => onSelectScenario(descriptor.id)}
      >
        <EmptyPage width={14} height={14} className="scenario-row__file" aria-hidden="true" />
        <span className="scenario-row__name">{descriptor.sourceFilename}</span>
        {isActive && activeScenarioDirty ? (
          <span className="scenario-row__dirty" aria-hidden="true" />
        ) : null}
        <span
          className={`scenario-row__status scenario-row__status--${hasSaveError ? 'invalid' : statusTone(descriptor)}`}
          aria-label={rowStatus}
        >
          {scenarioLoadingId === descriptor.id ? (
            <LoadingDots size="inline" />
          ) : hasSaveError ? (
            <WarningCircle width={14} height={14} aria-hidden="true" />
          ) : (
            <ScenarioStatusMark descriptor={descriptor} />
          )}
        </span>
      </button>
      <button
        className="scenario-row__remove"
        type="button"
        aria-label={`Remove ${descriptor.sourceFilename} from this workspace`}
        title={
          isActive && activeScenarioDirty
            ? 'Save or discard changes before removing'
            : 'Remove from workspace'
        }
        disabled={removeDisabled}
        onClick={() => onRemoveScenarioRequest(descriptor)}
      >
        <Xmark width={14} height={14} strokeWidth={2} />
      </button>
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
  activeScenarioDirty,
  fileOperation,
  fileError,
  fileErrorOperation,
  fileActions,
  onSelectScenario,
  onNewScenario,
  onImportScenario,
  onRemoveScenario,
}: ScenarioBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [internalExamplesExpanded, setInternalExamplesExpanded] = useState(true);
  const [internalExamplesDismissed, setInternalExamplesDismissed] = useState(false);
  const [localsExpanded, setLocalsExpanded] = useState(true);
  const [pendingRemoval, setPendingRemoval] = useState<ScenarioDescriptor | null>(null);
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
  const matchingLocals = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (query === '') return localScenarios;
    return localScenarios.filter((descriptor) =>
      `${descriptor.sourceFilename} ${descriptor.displayName}`.toLocaleLowerCase().includes(query),
    );
  }, [localScenarios, searchQuery]);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const searchActive = searchQuery.trim() !== '';
  const expandedFolders = useMemo(() => {
    const availableFolders = getScenarioTreeFolderPaths(tree);
    if (searchActive) return availableFolders;

    for (const folderPath of collapsedFolders) availableFolders.delete(folderPath);
    return availableFolders;
  }, [collapsedFolders, searchActive, tree]);
  const fileBusy = fileOperation !== 'idle';
  const interactionDisabled = scenarioSelectionDisabled || readOnly;
  const importDisabled = interactionDisabled || fileBusy || scenarioLoadingId !== null;
  const replacementDisabledReason = readOnly
    ? 'Return to the current workspace to edit scenarios'
    : scenarioSelectionDisabled
      ? 'Finish the active run before replacing the current scenario'
      : fileBusy
        ? 'Wait for the current scenario file operation to finish'
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

  return (
    <>
      <aside className="scenario-sidebar" aria-label="Scenario browser">
        <div className="scenario-sidebar__header">
          <div className="scenario-sidebar__title">
            <strong>Scenarios</strong>
            <MoreHoriz width={16} height={16} aria-hidden="true" />
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
        </div>

        <div className="scenario-sidebar__scroll">
          {examplesDismissed ? (
            <button
              className="scenario-examples-restore"
              type="button"
              onClick={() => setExamplesDismissed(false)}
            >
              Examples hidden <span>Restore</span>
            </button>
          ) : (
            <section aria-label="Examples">
              <SectionLabel
                label="Examples"
                count={examples.length}
                expanded={examplesExpanded}
                onToggle={() => setExamplesExpanded(!examplesExpanded)}
                onDismiss={() => setExamplesDismissed(true)}
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
                    selectionDisabled={interactionDisabled || fileBusy}
                    onToggleFolder={toggleFolder}
                    onSelectScenario={onSelectScenario}
                    folderToggleDisabled={searchActive}
                  />
                )
              ) : null}
            </section>
          )}

          <section aria-label="My scenarios">
            <SectionLabel
              label="My scenarios"
              count={localScenarios.length}
              expanded={localsExpanded}
              onToggle={() => setLocalsExpanded((expanded) => !expanded)}
            />
            {localsExpanded ? (
              <>
                {matchingLocals.map((descriptor) => (
                  <LocalScenarioRow
                    key={descriptor.id}
                    descriptor={descriptor}
                    selectedScenarioId={selectedScenarioId}
                    activeScenarioId={activeScenarioId}
                    scenarioLoadingId={scenarioLoadingId}
                    selectionDisabled={interactionDisabled || fileBusy}
                    activeScenarioDirty={activeScenarioDirty}
                    hasSaveError={
                      descriptor.id === activeScenarioId &&
                      fileError !== null &&
                      (fileErrorOperation === 'saving' || fileErrorOperation === 'saving_as')
                    }
                    onSelectScenario={onSelectScenario}
                    onRemoveScenarioRequest={requestRemove}
                  />
                ))}
                {matchingLocals.length === 0 ? (
                  <div className="scenario-sidebar__empty-local">
                    <span>
                      {searchActive && localScenarios.length > 0
                        ? 'No matching local files.'
                        : 'No local scenarios yet. Import a YAML file below to add one for this session.'}
                    </span>
                  </div>
                ) : null}
              </>
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
    </>
  );
}
