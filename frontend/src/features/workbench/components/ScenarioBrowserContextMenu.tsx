import { useLayoutEffect, useRef, useState } from 'react';
import type { ScenarioDescriptor, ScenarioFolder } from '../types';

export interface ScenarioContextMenuState {
  x: number;
  y: number;
  kind: 'folder' | 'scenario' | 'root';
  id: string;
}

interface ScenarioBrowserContextMenuProps {
  contextMenu: ScenarioContextMenuState;
  localFolders: ScenarioFolder[];
  localScenarios: ScenarioDescriptor[];
  activeScenarioId: string;
  activeScenarioDirty: boolean;
  folderMenuDisabled: boolean;
  scenarioMenuDisabled: boolean;
  folderContainsActiveScenario: (folderId: string) => boolean;
  onClose: () => void;
  onRequestCreateFolder: (parentId?: string) => void;
  onRenameFolder: (folder: ScenarioFolder) => void;
  onDeleteFolder: (folder: ScenarioFolder) => void;
  onMoveScenario: (id: string, folderId: string, siblingIndex: number) => void;
  onRemoveScenario: (descriptor: ScenarioDescriptor) => void;
}

export function ScenarioBrowserContextMenu({
  contextMenu,
  localFolders,
  localScenarios,
  activeScenarioId,
  activeScenarioDirty,
  folderMenuDisabled,
  scenarioMenuDisabled,
  folderContainsActiveScenario,
  onClose,
  onRequestCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveScenario,
  onRemoveScenario,
}: ScenarioBrowserContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: contextMenu.x, top: contextMenu.y });
  const contextFolder =
    contextMenu.kind === 'folder'
      ? (localFolders.find((folder) => folder.id === contextMenu.id) ?? null)
      : null;
  const contextScenario =
    contextMenu.kind === 'scenario'
      ? (localScenarios.find((scenario) => scenario.id === contextMenu.id) ?? null)
      : null;

  useLayoutEffect(() => {
    const reposition = () => {
      if (menuRef.current === null) return;
      const menu = menuRef.current.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - menu.width - 8)),
        top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - menu.height - 8)),
      });
    };
    reposition();
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [contextMenu]);

  const contextFolders = [...localFolders].sort(
    (left, right) => left.siblingOrder - right.siblingOrder || left.name.localeCompare(right.name),
  );

  return (
    <div
      ref={menuRef}
      className="scenario-context-menu"
      role="menu"
      style={{ left: position.left, top: position.top }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {contextFolder ? (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={folderMenuDisabled}
            onClick={() => {
              onClose();
              onRequestCreateFolder(contextFolder.id);
            }}
          >
            New folder
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={folderMenuDisabled}
            onClick={() => onRenameFolder(contextFolder)}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="scenario-context-menu__danger"
            disabled={
              folderMenuDisabled ||
              (activeScenarioDirty && folderContainsActiveScenario(contextFolder.id))
            }
            onClick={() => onDeleteFolder(contextFolder)}
          >
            Delete folder
          </button>
        </>
      ) : contextMenu.kind === 'root' ? (
        <button
          type="button"
          role="menuitem"
          disabled={folderMenuDisabled}
          onClick={() => {
            onClose();
            onRequestCreateFolder();
          }}
        >
          New folder
        </button>
      ) : contextScenario ? (
        <>
          <span className="scenario-context-menu__label">Move to folder</span>
          <button
            type="button"
            role="menuitem"
            disabled={scenarioMenuDisabled}
            onClick={() => {
              onClose();
              onMoveScenario(contextScenario.id, '', 0);
            }}
          >
            Root
          </button>
          {contextFolders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              role="menuitem"
              disabled={scenarioMenuDisabled}
              onClick={() => {
                onClose();
                onMoveScenario(contextScenario.id, folder.id, 0);
              }}
            >
              {folder.name}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className="scenario-context-menu__danger"
            disabled={
              scenarioMenuDisabled ||
              (contextScenario.id === activeScenarioId && activeScenarioDirty)
            }
            onClick={() => {
              onClose();
              onRemoveScenario(contextScenario);
            }}
          >
            Remove from workspace
          </button>
        </>
      ) : null}
    </div>
  );
}
