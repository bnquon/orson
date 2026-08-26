import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle, Cube, EditPencil, MoreVert, NavArrowDown, Plus, Trash } from 'iconoir-react';
import { Modal, ModalActions, ModalButton } from '../../components/Modal';
import { Toast } from '../../components/Toast';
import type { WorkspaceController, WorkspaceGuardState } from './useWorkspace';
import { validateWorkspaceName } from './validation';
import './workspace.css';

interface WorkspaceSelectorProps {
  controller: WorkspaceController;
  guards: WorkspaceGuardState;
  onCreated?: (workspaceName: string) => void;
  onDeleted?: (workspaceName: string) => void;
}

interface OperationFeedback {
  message: string;
  tone: 'info' | 'success';
}

export function WorkspaceSelector({
  controller,
  guards,
  onCreated,
  onDeleted,
}: WorkspaceSelectorProps) {
  const [open, setOpen] = useState(false);
  const [menuRendered, setMenuRendered] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'create' | 'rename' | null>(null);
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [blockedMessage, setBlockedMessage] = useState('');
  const [nameError, setNameError] = useState('');
  const [operationFeedback, setOperationFeedback] = useState<OperationFeedback | null>(null);
  const switchTargetRef = useRef<{ id: string; name: string } | null>(null);
  const selectorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const focusActiveOnNextOpenRef = useRef(false);
  const workspaceItemRefs = useRef(new Map<string, HTMLButtonElement>());
  const data = controller.data;

  const openMenu = useCallback(
    (focusActive = false) => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setMenuRendered(true);
      setOpen(true);
      setBlockedMessage('');
      if (focusActive) {
        window.requestAnimationFrame(() => {
          if (data !== null) workspaceItemRefs.current.get(data.activeWorkspace.id)?.focus();
        });
      }
    },
    [data],
  );

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    setOpenActionsId(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setMenuRendered(false);
      closeTimerRef.current = null;
    }, 140);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const workspaces = data?.workspaces ?? [];

    const handlePointerDown = (event: PointerEvent) => {
      if (!selectorRef.current?.contains(event.target as Node)) closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      const workspaceButton = target?.closest<HTMLButtonElement>('.workspace-selector__workspace');
      const workspaceId = workspaceButton?.dataset.workspaceId;
      if (workspaceId === undefined) return;

      const currentIndex = workspaces.findIndex((workspace) => workspace.id === workspaceId);
      if (currentIndex < 0) return;

      let nextIndex: number | null = null;
      if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % workspaces.length;
      if (event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + workspaces.length) % workspaces.length;
      }
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = workspaces.length - 1;
      if (nextIndex === null) return;

      event.preventDefault();
      const nextWorkspace = workspaces[nextIndex];
      workspaceItemRefs.current.get(nextWorkspace.id)?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, data?.workspaces, open]);

  useEffect(() => {
    const target = switchTargetRef.current;
    if (controller.error !== null) {
      switchTargetRef.current = null;
      return;
    }
    if (target === null || controller.operation !== 'idle') return;
    switchTargetRef.current = null;
    if (controller.data?.activeWorkspace.id === target.id) {
      setOperationFeedback({ message: `Switched to ${target.name}.`, tone: 'success' });
    }
  }, [controller.data?.activeWorkspace.id, controller.error, controller.operation]);

  if (data === null) return <span className="workbench-context-label">Scenarios</span>;

  const startCreate = () => {
    if (guards.runActive) {
      setBlockedMessage('Finish the active run before creating a workspace.');
      return;
    }
    setName('');
    setNameError('');
    setDialog('create');
    closeMenu();
  };
  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setName(currentName);
    setNameError('');
    setDialog('rename');
    closeMenu();
  };
  const submitName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateWorkspaceName(
      name,
      data.workspaces,
      dialog === 'rename' ? editingId : '',
    );
    if (validationError !== null) {
      setNameError(validationError);
      return;
    }
    const request =
      dialog === 'create' ? controller.create(name) : controller.rename(editingId, name);
    void request.then((ok) => {
      if (!ok) return;
      setDialog(null);
      if (dialog === 'create') onCreated?.(name.trim());
      else setOperationFeedback({ message: `Renamed to ${name.trim()}.`, tone: 'success' });
    });
  };
  const switchWorkspace = (id: string) => {
    const target = data.workspaces.find((workspace) => workspace.id === id);
    const decision = controller.requestSwitch(id, guards);
    if (decision === 'blocked')
      setBlockedMessage('Finish the active run before switching workspaces.');
    else {
      if (
        decision === 'started' &&
        target?.id !== data.activeWorkspace.id &&
        target !== undefined
      ) {
        switchTargetRef.current = { id: target.id, name: target.name };
        setOperationFeedback({ message: `Switching to ${target.name}…`, tone: 'info' });
      }
      closeMenu();
    }
  };
  const deleteWorkspace = (id: string) => {
    const decision = controller.requestDelete(id, guards);
    if (decision === 'blocked')
      setBlockedMessage('Finish the active run before deleting a workspace.');
    else closeMenu();
  };
  const pendingWorkspace = data.workspaces.find(
    (workspace) => workspace.id === controller.pending?.workspaceId,
  );
  const confirmPending = () => {
    const pendingWorkspaceName =
      controller.pending?.kind === 'delete' ? pendingWorkspace?.name : undefined;
    if (controller.pending?.kind === 'switch' && pendingWorkspace !== undefined) {
      switchTargetRef.current = { id: pendingWorkspace.id, name: pendingWorkspace.name };
      setOperationFeedback({ message: `Switching to ${pendingWorkspace.name}…`, tone: 'info' });
    }
    void Promise.resolve(controller.confirmPending()).then((ok) => {
      if (ok && pendingWorkspaceName !== undefined) onDeleted?.(pendingWorkspaceName);
    });
  };

  return (
    <>
      <div className="workspace-selector" ref={selectorRef}>
        <button
          ref={triggerRef}
          className="workspace-selector__trigger"
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              focusActiveOnNextOpenRef.current = true;
              return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              openMenu(true);
            }
          }}
          onClick={() => {
            if (open) closeMenu();
            else {
              const focusActive = focusActiveOnNextOpenRef.current;
              focusActiveOnNextOpenRef.current = false;
              openMenu(focusActive);
            }
          }}
        >
          <Cube className="workspace-selector__trigger-icon" width={15} height={15} />
          <span>{data.activeWorkspace.name}</span>
          <NavArrowDown className="workspace-selector__chevron" width={14} height={14} />
        </button>
        {menuRendered ? (
          <div
            className={`workspace-selector__menu ${open ? 'workspace-selector__menu--open' : 'workspace-selector__menu--closing'}`}
            role="menu"
            aria-label="Switch workspace"
            aria-hidden={!open}
          >
            <div className="workspace-selector__header">
              <span>Switch workspace</span>
              <span className="workspace-selector__count">{data.workspaces.length}</span>
            </div>
            {data.workspaces.map((workspace) => (
              <div
                className={`workspace-selector__row ${workspace.id === data.activeWorkspace.id ? 'workspace-selector__row--active' : ''}`}
                key={workspace.id}
              >
                <button
                  ref={(element) => {
                    if (element === null) workspaceItemRefs.current.delete(workspace.id);
                    else workspaceItemRefs.current.set(workspace.id, element);
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={workspace.id === data.activeWorkspace.id}
                  className="workspace-selector__workspace"
                  data-workspace-id={workspace.id}
                  onClick={() => switchWorkspace(workspace.id)}
                >
                  <Cube className="workspace-selector__workspace-icon" width={16} height={16} />
                  <span className="workspace-selector__workspace-name">{workspace.name}</span>
                  {workspace.id === data.activeWorkspace.id ? (
                    <CheckCircle
                      className="workspace-selector__active-check"
                      width={16}
                      height={16}
                    />
                  ) : null}
                </button>
                <div className="workspace-selector__actions">
                  <button
                    type="button"
                    className="workspace-selector__more"
                    aria-label={`More actions for ${workspace.name}`}
                    aria-expanded={openActionsId === workspace.id}
                    aria-haspopup="menu"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenActionsId((current) =>
                        current === workspace.id ? null : workspace.id,
                      );
                    }}
                  >
                    <MoreVert width={18} height={18} strokeWidth={2} />
                  </button>
                  {openActionsId === workspace.id ? (
                    <div className="workspace-selector__actions-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className="workspace-selector__actions-rename"
                        onClick={() => startRename(workspace.id, workspace.name)}
                      >
                        <EditPencil width={14} height={14} /> Rename
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="workspace-selector__actions-delete"
                        disabled={data.workspaces.length === 1}
                        onClick={() => deleteWorkspace(workspace.id)}
                      >
                        <Trash width={14} height={14} /> Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {blockedMessage ? (
              <div className="workspace-selector__error" role="alert">
                {blockedMessage}
              </div>
            ) : null}
            <button
              className="workspace-selector__create"
              type="button"
              role="menuitem"
              onClick={startCreate}
            >
              <Plus width={15} height={15} /> Create workspace
            </button>
          </div>
        ) : null}
      </div>

      {operationFeedback && controller.error === null ? (
        <Toast
          message={operationFeedback.message}
          tone={operationFeedback.tone}
          onDismiss={() => setOperationFeedback(null)}
        />
      ) : null}
      {controller.error && controller.pending === null && dialog === null ? (
        <Toast
          message={controller.error.message}
          tone="error"
          onDismiss={() => {
            controller.clearError();
            setOperationFeedback(null);
          }}
        />
      ) : null}

      <Modal
        open={dialog !== null}
        title={dialog === 'create' ? 'Create workspace' : 'Rename workspace'}
        description="Workspace names are unique and surrounding whitespace is removed."
        closeDisabled={controller.operation !== 'idle'}
        onClose={() => setDialog(null)}
        footer={
          <ModalActions>
            <ModalButton type="button" onClick={() => setDialog(null)}>
              Cancel
            </ModalButton>
            <ModalButton
              tone="primary"
              type="submit"
              form="workspace-name-form"
              disabled={controller.operation !== 'idle'}
            >
              {controller.operation === 'creating'
                ? 'Creating…'
                : controller.operation === 'renaming'
                  ? 'Renaming…'
                  : dialog === 'create'
                    ? 'Create'
                    : 'Rename'}
            </ModalButton>
          </ModalActions>
        }
      >
        <form id="workspace-name-form" onSubmit={submitName}>
          <label className="workspace-dialog__field">
            <span>Workspace name</span>
            <input
              autoFocus
              value={name}
              aria-invalid={nameError !== ''}
              onChange={(event) => {
                setName(event.target.value);
                setNameError('');
              }}
            />
          </label>
          {nameError ? (
            <p className="workspace-dialog__error" role="alert">
              {nameError}
            </p>
          ) : null}
          {controller.error ? (
            <p className="workspace-dialog__error" role="alert">
              {controller.error.message}
            </p>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={controller.pending !== null}
        title={controller.pending?.kind === 'delete' ? 'Delete workspace?' : 'Switch workspace?'}
        description={
          controller.pending?.kind === 'delete'
            ? `Delete ${pendingWorkspace?.name ?? 'this workspace'} metadata? Imported YAML files on disk will not be deleted or modified.`
            : 'Switching workspaces clears the current run and workspace session state.'
        }
        closeDisabled={controller.operation !== 'idle'}
        onClose={() => controller.cancelPending()}
        footer={
          <ModalActions>
            <ModalButton type="button" onClick={() => controller.cancelPending()}>
              Cancel
            </ModalButton>
            <ModalButton
              tone={controller.pending?.kind === 'delete' ? 'danger' : 'primary'}
              type="button"
              disabled={controller.operation !== 'idle'}
              onClick={confirmPending}
            >
              {controller.operation === 'deleting'
                ? 'Deleting…'
                : controller.operation === 'switching'
                  ? 'Switching…'
                  : controller.pending?.kind === 'delete'
                    ? 'Delete workspace'
                    : 'Switch workspace'}
            </ModalButton>
          </ModalActions>
        }
      >
        {controller.error ? (
          <p className="workspace-dialog__error" role="alert">
            {controller.error.message}
          </p>
        ) : null}
        {controller.pending?.dirty ? (
          <p>You have unsaved scenario changes. They will be discarded.</p>
        ) : (
          <p>Your YAML files remain unchanged.</p>
        )}
      </Modal>
    </>
  );
}

export function WorkspacePersistenceNotice({ controller }: { controller: WorkspaceController }) {
  const persistence = controller.data?.persistence;
  if (persistence?.mode !== 'session_only') return null;
  return (
    <>
      <div className="workspace-persistence-warning" role="status">
        <span>
          {persistence.warning || 'Session only—workspace changes will be lost when Orson closes.'}
        </span>
        <button
          type="button"
          disabled={controller.operation === 'retrying'}
          onClick={() => void controller.retryPersistence(false)}
        >
          {controller.operation === 'retrying' ? 'Retrying…' : 'Retry'}
        </button>
      </div>
      <Modal
        open={controller.recoveryConfirmation}
        title="Recover workspace persistence?"
        description="The current in-memory workspace state will be written into the recovered database. Unrelated durable workspaces will be kept."
        closeDisabled={controller.operation === 'retrying'}
        onClose={() => controller.cancelRecovery()}
        footer={
          <ModalActions>
            <ModalButton type="button" onClick={() => controller.cancelRecovery()}>
              Cancel
            </ModalButton>
            <ModalButton
              tone="primary"
              type="button"
              onClick={() => void controller.retryPersistence(true)}
            >
              {controller.operation === 'retrying' ? 'Recovering…' : 'Recover and save'}
            </ModalButton>
          </ModalActions>
        }
      >
        <p>Once recovery succeeds, future workspace changes will be saved normally.</p>
      </Modal>
    </>
  );
}
