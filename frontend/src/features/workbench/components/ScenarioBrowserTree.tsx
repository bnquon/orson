import type { DragEvent, KeyboardEvent, MouseEvent } from 'react';
import { CheckCircle, EmptyPage, NavArrowDown, WarningCircle } from 'iconoir-react';
import { LoadingDots } from '../../../components/LoadingDots';
import type { ScenarioDescriptor, ScenarioFolder } from '../types';
import type { ScenarioFolderOperation } from '../useScenario';
import type { ScenarioTreeFolder } from '../scenarioTree';

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

export interface ScenarioRowsProps {
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

export type DropPosition = 'before' | 'inside' | 'after' | 'invalid';

export interface DropTarget {
  kind: 'root' | 'folder' | 'scenario';
  id: string;
  position: DropPosition;
}

export function readDragData(event: DragEvent): { kind: 'folder' | 'scenario'; id: string } | null {
  try {
    const parsed = JSON.parse(event.dataTransfer.getData('text/plain')) as {
      kind?: string;
      id?: string;
    };
    if ((parsed.kind === 'folder' || parsed.kind === 'scenario') && parsed.id) {
      return { kind: parsed.kind, id: parsed.id };
    }
  } catch {
    // Ignore drops from outside the scenario tree.
  }
  return null;
}

function rowDropPosition(event: DragEvent<HTMLElement>): Exclude<DropPosition, 'invalid'> {
  const bounds = event.currentTarget.getBoundingClientRect();
  const relativePosition = (event.clientY - bounds.top) / Math.max(bounds.height, 1);
  if (relativePosition < 0.33) return 'before';
  if (relativePosition > 0.67) return 'after';
  return 'inside';
}

function scenarioDropPosition(event: DragEvent<HTMLElement>): 'before' | 'after' {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientY - bounds.top < bounds.height / 2 ? 'before' : 'after';
}

export function getScenarioDropIndex(
  sourceIndex: number,
  targetIndex: number,
  position: 'before' | 'after',
): number {
  const targetIndexAfterRemoval =
    sourceIndex >= 0 && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  return targetIndexAfterRemoval + (position === 'after' ? 1 : 0);
}

function isFolderDescendant(
  folders: ScenarioFolder[],
  folderID: string,
  possibleDescendantID: string,
): boolean {
  let parentID = folders.find((folder) => folder.id === possibleDescendantID)?.parentId;
  while (parentID) {
    if (parentID === folderID) return true;
    parentID = folders.find((folder) => folder.id === parentID)?.parentId;
  }
  return false;
}

interface LocalScenarioTreeState {
  selectedScenarioId: string | null;
  activeScenarioId: string;
  scenarioLoadingId: string | null;
  selectionDisabled: boolean;
  readOnly: boolean;
  activeScenarioDirty: boolean;
  saveErrorScenarioId: string | null;
  searchActive: boolean;
  folderOperation: ScenarioFolderOperation;
}

interface LocalScenarioTreeActions {
  onToggleFolder: (id: string) => void;
  onSelectScenario: (id: string) => void;
  onContextMenu: (event: MouseEvent, item: { kind: 'folder' | 'scenario'; id: string }) => void;
  onMoveFolder: (id: string, parentId: string) => Promise<boolean>;
  onReorderFolder: (id: string, siblingIndex: number) => Promise<boolean>;
  onMoveScenario: (id: string, folderId: string, siblingIndex: number) => Promise<boolean>;
  onDropTargetChange: (target: DropTarget | null) => void;
}

export interface LocalScenarioTreeProps {
  folders: ScenarioTreeFolder[];
  scenarios: ScenarioDescriptor[];
  expandedFolders: Set<string>;
  localFolderRecords: ScenarioFolder[];
  state: LocalScenarioTreeState;
  actions: LocalScenarioTreeActions;
  dropTarget: DropTarget | null;
  onRootDrop: (event: DragEvent<HTMLDivElement>) => void;
  depth?: number;
}

export function LocalScenarioTree({
  folders,
  scenarios,
  expandedFolders,
  localFolderRecords,
  state,
  actions,
  dropTarget,
  onRootDrop,
  depth = 0,
}: LocalScenarioTreeProps) {
  const disabled = state.selectionDisabled || state.readOnly || state.folderOperation !== 'idle';
  const keyboardContextMenu = (
    event: KeyboardEvent<HTMLButtonElement>,
    item: { kind: 'folder' | 'scenario'; id: string },
  ) => {
    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    actions.onContextMenu(
      {
        clientX: rect.left + 12,
        clientY: rect.bottom,
        preventDefault: () => undefined,
        stopPropagation: () => undefined,
      } as MouseEvent,
      item,
    );
  };

  const renderScenario = (descriptor: ScenarioDescriptor, depth: number, index: number) => {
    const isActive = descriptor.id === state.activeScenarioId;
    const isSelected = descriptor.id === state.selectedScenarioId;
    const hasSaveError = descriptor.id === state.saveErrorScenarioId;
    const rowDisabled = disabled || state.scenarioLoadingId !== null;
    const rowStatus = hasSaveError
      ? 'Save failed'
      : isActive && state.activeScenarioDirty
        ? 'Unsaved changes'
        : statusLabel(descriptor);
    return (
      <div
        key={descriptor.id}
        className={`scenario-row__local-wrapper ${dropTarget?.kind === 'scenario' && dropTarget.id === descriptor.id ? `scenario-row__local-wrapper--drop-${dropTarget.position}` : ''}`}
      >
        <button
          className={`scenario-row scenario-row--scenario scenario-row--local ${isActive ? 'scenario-row--active' : ''} ${isSelected && !isActive ? 'scenario-row--selected' : ''} ${hasSaveError ? 'scenario-row--save-error' : ''}`}
          type="button"
          draggable={!rowDisabled && !state.searchActive}
          disabled={rowDisabled}
          style={{ paddingLeft: `${26 + depth * 14}px` }}
          aria-current={isActive ? 'page' : undefined}
          aria-label={`${descriptor.sourceFilename}, local file, ${rowStatus}${isActive ? ', active' : ''}`}
          title={`${descriptor.sourcePath || descriptor.sourceFilename} · ${rowStatus}`}
          onClick={() => actions.onSelectScenario(descriptor.id)}
          onContextMenu={(event) =>
            actions.onContextMenu(event, { kind: 'scenario', id: descriptor.id })
          }
          onKeyDown={(event) => keyboardContextMenu(event, { kind: 'scenario', id: descriptor.id })}
          onDragStart={(event) => {
            event.dataTransfer.setData(
              'text/plain',
              JSON.stringify({ kind: 'scenario', id: descriptor.id }),
            );
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => actions.onDropTargetChange(null)}
          onDragOver={(event) => {
            if (!state.searchActive && !disabled) {
              event.preventDefault();
              event.stopPropagation();
              const drag = readDragData(event);
              if (drag?.kind === 'scenario' && drag.id !== descriptor.id) {
                actions.onDropTargetChange({
                  kind: 'scenario',
                  id: descriptor.id,
                  position: scenarioDropPosition(event),
                });
              } else {
                actions.onDropTargetChange({
                  kind: 'scenario',
                  id: descriptor.id,
                  position: 'invalid',
                });
                event.dataTransfer.dropEffect = 'none';
              }
            }
          }}
          onDrop={(event) => {
            actions.onDropTargetChange(null);
            if (state.searchActive || disabled) return;
            event.preventDefault();
            event.stopPropagation();
            const drag = readDragData(event);
            if (drag?.kind === 'scenario' && drag.id !== descriptor.id) {
              const position = scenarioDropPosition(event);
              const sourceIndex = scenarios.findIndex((item) => item.id === drag.id);
              void actions.onMoveScenario(
                drag.id,
                descriptor.folderId ?? '',
                getScenarioDropIndex(sourceIndex, index, position),
              );
            }
          }}
        >
          <EmptyPage width={14} height={14} className="scenario-row__file" aria-hidden="true" />
          <span className="scenario-row__name">{descriptor.sourceFilename}</span>
          {isActive && state.activeScenarioDirty ? (
            <span className="scenario-row__dirty" aria-hidden="true" />
          ) : null}
          <span
            className={`scenario-row__status scenario-row__status--${hasSaveError ? 'invalid' : statusTone(descriptor)}`}
            aria-label={rowStatus}
          >
            {state.scenarioLoadingId === descriptor.id ? (
              <LoadingDots size="inline" />
            ) : hasSaveError ? (
              <WarningCircle width={14} height={14} aria-hidden="true" />
            ) : (
              <ScenarioStatusMark descriptor={descriptor} />
            )}
          </span>
        </button>
      </div>
    );
  };

  const handleFolderDrop = (event: DragEvent<HTMLButtonElement>, folder: ScenarioTreeFolder) => {
    const drag = readDragData(event);
    if (drag === null || drag.kind !== 'folder' || drag.id === folder.id) return;

    if (isFolderDescendant(localFolderRecords, drag.id, folder.id)) return;

    const draggedFolder = localFolderRecords.find((item) => item.id === drag.id);
    if (draggedFolder === undefined) return;

    const position = rowDropPosition(event);
    if (position === 'inside') {
      void actions.onMoveFolder(drag.id, folder.id);
      return;
    }

    const siblings = localFolderRecords
      .filter((item) => item.parentId === folder.parentId && item.id !== drag.id)
      .sort(
        (left, right) =>
          left.siblingOrder - right.siblingOrder || left.name.localeCompare(right.name),
      );
    const targetIndex = siblings.findIndex((item) => item.id === folder.id);
    if (targetIndex < 0) return;
    const siblingIndex = targetIndex + (position === 'after' ? 1 : 0);
    const reorder = async () => {
      if (
        draggedFolder.parentId !== folder.parentId &&
        !(await actions.onMoveFolder(drag.id, folder.parentId))
      ) {
        return;
      }
      await actions.onReorderFolder(drag.id, siblingIndex);
    };
    void reorder();
  };

  const renderFolder = (folder: ScenarioTreeFolder, depth: number) => {
    const expanded = expandedFolders.has(folder.id);
    return (
      <div key={folder.id} className="scenario-folder">
        <button
          className={`scenario-row scenario-row--folder ${dropTarget?.kind === 'folder' && dropTarget.id === folder.id ? `scenario-row--drop-${dropTarget.position}` : ''}`}
          type="button"
          draggable={!disabled && !state.searchActive}
          disabled={disabled}
          tabIndex={disabled ? -1 : undefined}
          aria-expanded={expanded}
          style={{ paddingLeft: `${9 + depth * 14}px` }}
          onClick={() => actions.onToggleFolder(folder.id)}
          onContextMenu={(event) => actions.onContextMenu(event, { kind: 'folder', id: folder.id })}
          onKeyDown={(event) => keyboardContextMenu(event, { kind: 'folder', id: folder.id })}
          onDragStart={(event) => {
            event.dataTransfer.setData(
              'text/plain',
              JSON.stringify({ kind: 'folder', id: folder.id }),
            );
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => actions.onDropTargetChange(null)}
          onDragOver={(event) => {
            if (!state.searchActive && !disabled) {
              event.preventDefault();
              event.stopPropagation();
              const drag = readDragData(event);
              const invalidFolderDrop =
                drag?.kind === 'folder' &&
                (drag.id === folder.id ||
                  isFolderDescendant(localFolderRecords, drag.id, folder.id));
              if (invalidFolderDrop) {
                event.dataTransfer.dropEffect = 'none';
                actions.onDropTargetChange({ kind: 'folder', id: folder.id, position: 'invalid' });
              } else {
                actions.onDropTargetChange({
                  kind: 'folder',
                  id: folder.id,
                  position: drag?.kind === 'scenario' ? 'inside' : rowDropPosition(event),
                });
              }
            }
          }}
          onDrop={(event) => {
            actions.onDropTargetChange(null);
            if (state.searchActive || disabled) return;
            event.preventDefault();
            event.stopPropagation();
            const drag = readDragData(event);
            if (drag === null || drag.id === folder.id) return;
            if (
              drag.kind === 'folder' &&
              isFolderDescendant(localFolderRecords, drag.id, folder.id)
            ) {
              return;
            }
            if (drag.kind === 'folder') handleFolderDrop(event, folder);
            else void actions.onMoveScenario(drag.id, folder.id, folder.scenarios.length);
          }}
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
          aria-hidden={!expanded}
        >
          <div className="scenario-folder-content__inner">
            {expanded ? (
              <LocalScenarioTree
                folders={folder.folders}
                scenarios={folder.scenarios}
                expandedFolders={expandedFolders}
                localFolderRecords={localFolderRecords}
                state={state}
                actions={actions}
                dropTarget={dropTarget}
                onRootDrop={onRootDrop}
                depth={depth + 1}
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`scenario-local-tree ${dropTarget?.kind === 'root' ? 'scenario-local-tree--drop-target' : ''}`}
      onDragOver={(event) => {
        if (!state.searchActive && !disabled) {
          event.preventDefault();
          actions.onDropTargetChange({ kind: 'root', id: '', position: 'inside' });
        }
      }}
      onDrop={(event) => {
        actions.onDropTargetChange(null);
        onRootDrop(event);
      }}
    >
      {scenarios.map((descriptor, index) => renderScenario(descriptor, depth, index))}
      {folders.map((folder) => renderFolder(folder, depth))}
    </div>
  );
}
