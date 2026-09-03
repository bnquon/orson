import { Modal, ModalActions, ModalButton } from '../../../components/Modal';
import type { ApiError, ScenarioFolder } from '../types';
import type { ScenarioFolderOperation } from '../useScenario';

interface ScenarioFolderDialogsProps {
  renameFolder: ScenarioFolder | null;
  renameValue: string;
  folderError: ApiError | null;
  folderOperation: ScenarioFolderOperation;
  deleteFolder: ScenarioFolder | null;
  folderScenarioCount: (folderId: string) => number;
  onRenameValueChange: (value: string) => void;
  onConfirmRename: () => void;
  onCloseRename: () => void;
  onConfirmDelete: () => void;
  onCloseDelete: () => void;
}

export function ScenarioFolderDialogs({
  renameFolder,
  renameValue,
  folderError,
  folderOperation,
  deleteFolder,
  folderScenarioCount,
  onRenameValueChange,
  onConfirmRename,
  onCloseRename,
  onConfirmDelete,
  onCloseDelete,
}: ScenarioFolderDialogsProps) {
  return (
    <>
      <Modal
        open={renameFolder !== null}
        title="Rename folder"
        description="Folder names are trimmed and must be unique within their parent folder."
        closeDisabled={folderOperation !== 'idle'}
        onClose={onCloseRename}
        footer={
          <ModalActions>
            <ModalButton type="button" onClick={onCloseRename}>
              Cancel
            </ModalButton>
            <ModalButton
              tone="primary"
              type="button"
              disabled={folderOperation !== 'idle'}
              onClick={onConfirmRename}
            >
              {folderOperation === 'renaming' ? 'Renaming…' : 'Rename'}
            </ModalButton>
          </ModalActions>
        }
      >
        <label className="scenario-folder-field">
          <span>Folder name</span>
          <input
            autoFocus
            value={renameValue}
            aria-invalid={folderError !== null}
            aria-describedby={folderError ? 'rename-scenario-folder-error' : undefined}
            onChange={(event) => onRenameValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onConfirmRename();
            }}
          />
        </label>
        {folderError ? (
          <p className="workspace-dialog__error" id="rename-scenario-folder-error" role="alert">
            {folderError.message}
          </p>
        ) : null}
      </Modal>
      <Modal
        open={deleteFolder !== null}
        title="Delete folder?"
        description="This removes the folder organization and scenario associations from the workspace. Your files remain on disk."
        closeDisabled={folderOperation !== 'idle'}
        onClose={onCloseDelete}
        footer={
          <ModalActions>
            <ModalButton type="button" onClick={onCloseDelete}>
              Cancel
            </ModalButton>
            <ModalButton
              tone="danger"
              type="button"
              disabled={folderOperation !== 'idle'}
              onClick={onConfirmDelete}
            >
              {folderOperation === 'deleting' ? 'Deleting…' : 'Delete folder'}
            </ModalButton>
          </ModalActions>
        }
      >
        <p className="scenario-switch-copy">
          <strong>{deleteFolder?.name}</strong> and its nested folders contain{' '}
          {deleteFolder === null ? 0 : folderScenarioCount(deleteFolder.id)} scenario
          {deleteFolder !== null && folderScenarioCount(deleteFolder.id) === 1 ? '' : 's'}. The
          action cannot be undone by Orson.
        </p>
        {folderError ? (
          <p className="workspace-dialog__error" role="alert">
            {folderError.message}
          </p>
        ) : null}
      </Modal>
    </>
  );
}
