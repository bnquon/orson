import type { DragEvent, KeyboardEvent, MouseEvent } from 'react';
import { EmptyPage, NavArrowDown, WarningCircle } from 'iconoir-react';
import { LoadingDots } from '../../../components/LoadingDots';
import type { ScenarioDescriptor, ScenarioFolder } from '../types';
import type { ScenarioFolderOperation } from '../useScenario';
import type { ScenarioTreeFolder } from '../scenarioTree';
import { FolderIcon, ScenarioStatusMark, statusLabel, statusTone } from './ScenarioRows';
export { ScenarioRows } from './ScenarioRows';
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
                depth={depth + 1}
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="scenario-local-tree">
      {scenarios.map((descriptor, index) => renderScenario(descriptor, depth, index))}
      {folders.map((folder) => renderFolder(folder, depth))}
    </div>
  );
}
