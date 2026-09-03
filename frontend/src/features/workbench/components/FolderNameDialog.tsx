import type { FormEvent } from 'react';
import { Modal, ModalActions, ModalButton } from '../../../components/Modal';

interface FolderNameDialogProps {
  open: boolean;
  parentName: string;
  value: string;
  error: string;
  busy: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function FolderNameDialog({
  open,
  parentName,
  value,
  error,
  busy,
  onChange,
  onClose,
  onSubmit,
}: FolderNameDialogProps) {
  return (
    <Modal
      open={open}
      title={parentName ? `New folder in ${parentName}` : 'New folder'}
      description="Folder names are trimmed and unique within their parent folder."
      closeDisabled={busy}
      onClose={onClose}
      footer={
        <ModalActions>
          <ModalButton type="button" onClick={onClose}>
            Cancel
          </ModalButton>
          <ModalButton type="submit" form="new-scenario-folder" tone="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create folder'}
          </ModalButton>
        </ModalActions>
      }
    >
      <form id="new-scenario-folder" onSubmit={onSubmit}>
        <label className="scenario-folder-field">
          <span>Folder name</span>
          <input
            autoFocus
            value={value}
            aria-invalid={error !== ''}
            aria-describedby={error ? 'new-scenario-folder-error' : undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
        {error ? (
          <p className="workspace-dialog__error" id="new-scenario-folder-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
