import type { FormEvent } from 'react';
import { Modal, ModalActions, ModalButton } from '../../components/Modal';
import { PixelGridLoader } from '../../components/PixelGridLoader';
import type { WorkspaceController } from './useWorkspace';

export type WorkspaceDialog = 'create' | 'rename';
type WorkspaceAction = 'delete' | 'switch' | 'home';
type DialogVariant = 'launcher' | 'selector';

interface WorkspaceNameDialogProps {
  dialog: WorkspaceDialog | null;
  controller: WorkspaceController;
  name: string;
  nameError: string;
  formId: string;
  variant: DialogVariant;
  onClose: () => void;
  onNameChange: (name: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function WorkspaceNameDialog({
  dialog,
  controller,
  name,
  nameError,
  formId,
  variant,
  onClose,
  onNameChange,
  onSubmit,
}: WorkspaceNameDialogProps) {
  const launcher = variant === 'launcher';
  const errorClass = launcher ? 'workspace-start__field-error' : 'workspace-dialog__error';

  return (
    <Modal
      open={dialog !== null}
      title={dialog === 'create' ? 'Create workspace' : 'Rename workspace'}
      description="Workspace names are unique and surrounding whitespace is removed."
      closeDisabled={controller.operation !== 'idle'}
      onClose={onClose}
      footer={
        <ModalActions>
          <ModalButton type="button" onClick={onClose}>
            Cancel
          </ModalButton>
          <ModalButton
            tone="primary"
            type="submit"
            form={formId}
            disabled={controller.operation !== 'idle'}
          >
            {controller.operation === 'creating' ? (
              launcher ? (
                <>
                  <PixelGridLoader size="inline" /> Creating…
                </>
              ) : (
                'Creating…'
              )
            ) : controller.operation === 'renaming' ? (
              'Renaming…'
            ) : dialog === 'create' ? (
              'Create'
            ) : (
              'Rename'
            )}
          </ModalButton>
        </ModalActions>
      }
    >
      <form id={formId} onSubmit={onSubmit}>
        <label className={launcher ? 'workspace-start__field' : 'workspace-dialog__field'}>
          <span>Workspace name</span>
          <input
            autoFocus
            value={name}
            placeholder="Workspace 1"
            aria-invalid={nameError !== ''}
            onChange={(event) => onNameChange(event.target.value)}
          />
        </label>
        {nameError ? (
          <p className={errorClass} role="alert">
            {nameError}
          </p>
        ) : null}
        {controller.error ? (
          <p className={errorClass} role="alert">
            {controller.error.message}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

interface WorkspaceActionDialogProps {
  open: boolean;
  action: WorkspaceAction;
  controller: WorkspaceController;
  workspaceName?: string;
  dirty: boolean;
  variant: DialogVariant;
  onClose: () => void;
  onConfirm: () => void;
}

export function WorkspaceActionDialog({
  open,
  action,
  controller,
  workspaceName,
  dirty,
  variant,
  onClose,
  onConfirm,
}: WorkspaceActionDialogProps) {
  const launcher = variant === 'launcher';
  const isDelete = action === 'delete';
  const errorClass = launcher ? 'workspace-start__field-error' : 'workspace-dialog__error';
  const title =
    action === 'delete'
      ? 'Delete workspace?'
      : action === 'home'
        ? 'Return to workspace launcher?'
        : 'Switch workspace?';
  const description =
    action === 'delete'
      ? `Delete ${workspaceName ?? 'this workspace'} metadata? Imported YAML files on disk will not be deleted or modified.`
      : action === 'home'
        ? 'Leave this workspace and return to the workspace launcher.'
        : 'Switching workspaces clears the current run and workspace session state.';

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      closeDisabled={controller.operation !== 'idle'}
      onClose={onClose}
      footer={
        <ModalActions>
          <ModalButton type="button" onClick={onClose}>
            Cancel
          </ModalButton>
          <ModalButton
            tone={isDelete ? 'danger' : 'primary'}
            type="button"
            disabled={controller.operation !== 'idle'}
            onClick={onConfirm}
          >
            {controller.operation === 'deleting' ? (
              launcher ? (
                <>
                  <PixelGridLoader size="inline" /> Deleting…
                </>
              ) : (
                'Deleting…'
              )
            ) : controller.operation === 'switching' ? (
              'Switching…'
            ) : action === 'home' ? (
              'Return to launcher'
            ) : isDelete ? (
              'Delete workspace'
            ) : (
              'Switch workspace'
            )}
          </ModalButton>
        </ModalActions>
      }
    >
      {controller.error ? (
        <p className={errorClass} role="alert">
          {controller.error.message}
        </p>
      ) : null}
      {dirty ? (
        <p>You have unsaved scenario changes. They will be discarded.</p>
      ) : isDelete ? (
        <p>Your YAML files remain unchanged.</p>
      ) : null}
    </Modal>
  );
}
