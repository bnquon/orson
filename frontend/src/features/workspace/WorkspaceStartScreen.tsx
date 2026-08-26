import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { EditPencil, MoreVert, Plus, Search, Trash } from 'iconoir-react';
import orsonIcon from '../../assets/orson-icon.png';
import { PixelGridLoader } from '../../components/PixelGridLoader';
import {
  WorkspaceActionDialog,
  WorkspaceNameDialog,
  type WorkspaceDialog,
} from './WorkspaceDialogs';
import type { WorkspaceController } from './useWorkspace';
import { validateWorkspaceName } from './validation';
import { workspaceAccent, workspaceInitials } from './workspaceVisual';
import './workspace-start.css';

interface WorkspaceStartScreenProps {
  controller: WorkspaceController;
  onCreated?: (workspaceName: string) => void;
  onDeleted?: (workspaceName: string, returnToLauncher: boolean) => void;
  onEntered?: () => void;
}

const noGuards = { runActive: false, draftDirty: false };

function formatLastOpened(value: string): string {
  if (value === '') return 'Not opened yet';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Recently used';
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  const elapsedDays = Math.round(elapsedHours / 24);
  return elapsedDays === 1 ? 'Yesterday' : `${elapsedDays}d ago`;
}

export function WorkspaceStartScreen({
  controller,
  onCreated,
  onDeleted,
  onEntered,
}: WorkspaceStartScreenProps) {
  const [query, setQuery] = useState('');
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<WorkspaceDialog | null>(null);
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const workspaceRefs = useRef(new Map<string, HTMLButtonElement>());
  const enteringTargetRef = useRef<string | null>(null);
  const data = controller.data;
  const workspaces = data?.workspaces ?? [];
  const filteredWorkspaces = workspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const loadingList = data === null && controller.status === 'loading';
  const failedList = data === null && controller.status === 'failed';
  const enteringWorkspace = controller.operation === 'switching';

  useEffect(() => {
    const targetId = enteringTargetRef.current;
    if (targetId === null) return;
    if (controller.error !== null) {
      enteringTargetRef.current = null;
      return;
    }
    if (controller.operation === 'idle' && data?.activeWorkspace.id === targetId) {
      enteringTargetRef.current = null;
      onEntered?.();
    }
  }, [controller.error, controller.operation, data?.activeWorkspace.id, onEntered]);

  useEffect(() => {
    if (openActionsId === null) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const actions = document.querySelector(`[data-start-actions="${openActionsId}"]`);
      if (actions !== null && !actions.contains(target)) setOpenActionsId(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenActionsId(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openActionsId]);

  const openCreate = () => {
    controller.clearError();
    setName('');
    setNameError('');
    setDialog('create');
    setOpenActionsId(null);
  };

  const openRename = (id: string, currentName: string) => {
    controller.clearError();
    setEditingId(id);
    setName(currentName);
    setNameError('');
    setDialog('rename');
    setOpenActionsId(null);
  };

  const closeDialog = () => {
    if (controller.operation !== 'idle') return;
    setDialog(null);
    setNameError('');
    controller.clearError();
  };

  const submitName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (data === null) return;
    const validationError = validateWorkspaceName(
      name,
      data.workspaces,
      dialog === 'rename' ? editingId : '',
    );
    if (validationError !== null) {
      setNameError(validationError);
      return;
    }
    const trimmedName = name.trim();
    const request =
      dialog === 'create'
        ? controller.create(trimmedName)
        : controller.rename(editingId, trimmedName);
    void request.then((ok) => {
      if (!ok) return;
      setDialog(null);
      setNameError('');
      if (dialog === 'create') onCreated?.(trimmedName);
    });
  };

  const enterWorkspace = (id: string) => {
    setOpenActionsId(null);
    const decision = controller.requestSwitch(id, noGuards);
    if (decision === 'started' && data?.activeWorkspace.id === id) onEntered?.();
    else if (decision === 'started') enteringTargetRef.current = id;
  };

  const moveWorkspaceFocus = (id: string, direction: 'next' | 'previous' | 'first' | 'last') => {
    const index = filteredWorkspaces.findIndex((workspace) => workspace.id === id);
    if (index < 0) return;
    const nextIndex =
      direction === 'next'
        ? Math.min(filteredWorkspaces.length - 1, index + 1)
        : direction === 'previous'
          ? Math.max(0, index - 1)
          : direction === 'first'
            ? 0
            : filteredWorkspaces.length - 1;
    workspaceRefs.current.get(filteredWorkspaces[nextIndex]?.id)?.focus();
  };

  const renderWorkspaceRow = (workspace: (typeof workspaces)[number]) => {
    const actionsOpen = openActionsId === workspace.id;
    return (
      <div
        className="workspace-start__row-wrap"
        key={workspace.id}
        data-start-actions={workspace.id}
      >
        <button
          ref={(element) => {
            if (element === null) workspaceRefs.current.delete(workspace.id);
            else workspaceRefs.current.set(workspace.id, element);
          }}
          className="workspace-start__row"
          type="button"
          onClick={() => enterWorkspace(workspace.id)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              moveWorkspaceFocus(workspace.id, 'next');
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              moveWorkspaceFocus(workspace.id, 'previous');
            } else if (event.key === 'Home') {
              event.preventDefault();
              moveWorkspaceFocus(workspace.id, 'first');
            } else if (event.key === 'End') {
              event.preventDefault();
              moveWorkspaceFocus(workspace.id, 'last');
            }
          }}
          aria-label={`Open ${workspace.name}`}
        >
          <span
            className="workspace-start__icon"
            style={{ '--workspace-accent': workspaceAccent(workspace.name) } as CSSProperties}
            aria-hidden="true"
          >
            {workspaceInitials(workspace.name)}
          </span>
          <span className="workspace-start__row-main">
            <span className="workspace-start__name">{workspace.name}</span>
            <span className="workspace-start__meta">
              <span>{formatLastOpened(workspace.lastOpenedAt)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {workspace.scenarioCount ?? 0} scenario{workspace.scenarioCount === 1 ? '' : 's'}
              </span>
            </span>
          </span>
          <span className="workspace-start__status">
            <span
              className={`workspace-start__status-dot${workspace.hasRememberedConnection ? ' workspace-start__status-dot--configured' : ''}`}
              aria-hidden="true"
            />
            {workspace.hasRememberedConnection ? 'Configured' : 'Not configured'}
          </span>
        </button>
        <div
          className={`workspace-start__actions${actionsOpen ? ' workspace-start__actions--open' : ''}`}
        >
          <button
            className="workspace-start__more"
            type="button"
            aria-label={`Manage ${workspace.name}`}
            aria-expanded={actionsOpen}
            aria-haspopup="menu"
            onClick={(event) => {
              event.stopPropagation();
              setOpenActionsId((current) => (current === workspace.id ? null : workspace.id));
            }}
          >
            <MoreVert width={18} height={18} strokeWidth={2} />
          </button>
          {actionsOpen ? (
            <div className="workspace-start__actions-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="workspace-start__rename-action"
                onClick={() => openRename(workspace.id, workspace.name)}
              >
                <EditPencil width={14} height={14} /> Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className="workspace-start__delete-action"
                onClick={() => {
                  setOpenActionsId(null);
                  controller.requestDelete(workspace.id, noGuards);
                }}
              >
                <Trash width={14} height={14} /> Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const pendingWorkspace = workspaces.find(
    (workspace) => workspace.id === controller.pending?.workspaceId,
  );
  const confirmDelete = () => {
    const deletedName = pendingWorkspace?.name;
    void controller.confirmPending().then((ok) => {
      if (ok && deletedName !== undefined) onDeleted?.(deletedName, false);
    });
  };

  return (
    <main className="workspace-start-screen">
      <header className="workspace-start__topbar">
        <div className="workspace-start__brand">
          <img src={orsonIcon} alt="" aria-hidden="true" />
          <span>orson</span>
          <span className="workspace-start__slash">/</span>
          <span className="workspace-start__context">Workspace Launcher</span>
        </div>
      </header>

      <section className="workspace-start__content" aria-labelledby="workspace-start-title">
        {loadingList ? (
          <div className="workspace-start__loading" role="status">
            <PixelGridLoader size="setup" />
            <strong>Loading workspaces</strong>
            <p>Reading your recent workspaces before showing the launcher.</p>
          </div>
        ) : failedList ? (
          <div className="workspace-start__empty" role="alert">
            <strong>Workspaces could not be loaded.</strong>
            <p>{controller.error?.message ?? 'Try loading them again.'}</p>
            <button
              className="workspace-start__button workspace-start__button--primary"
              type="button"
              onClick={() => void controller.bootstrap()}
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="workspace-start__launcher">
            <div className="workspace-start__heading">
              <div>
                <h1 id="workspace-start-title">Open a workspace</h1>
                <p>
                  Choose a recent workspace or create a new one. Kafka connection setup happens
                  after you enter.
                </p>
              </div>
              <button
                className="workspace-start__button workspace-start__button--primary"
                type="button"
                onClick={openCreate}
              >
                <Plus width={16} height={16} /> Create workspace
              </button>
            </div>

            {controller.error !== null && dialog === null ? (
              <div className="workspace-start__inline-error" role="alert">
                {controller.error.message}
              </div>
            ) : null}

            {workspaces.length === 0 ? (
              <div className="workspace-start__empty">
                <img src={orsonIcon} alt="" aria-hidden="true" />
                <strong>No workspaces yet</strong>
                <p>
                  Create one by clicking the button above to keep scenarios and remembered
                  connection settings together.
                </p>
              </div>
            ) : (
              <section className="workspace-start__list-shell" aria-label="Recent workspaces">
                <header className="workspace-start__list-header">
                  <div className="workspace-start__list-title">
                    <strong>Recent workspaces</strong>
                    <span>{workspaces.length} saved</span>
                  </div>
                  <label className="workspace-start__search">
                    <Search width={15} height={15} aria-hidden="true" />
                    <span className="sr-only">Search workspaces</span>
                    <input
                      type="search"
                      value={query}
                      placeholder="Search workspaces"
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                </header>
                {filteredWorkspaces.length === 0 ? (
                  <div className="workspace-start__empty workspace-start__empty--compact">
                    <strong>No matching workspaces</strong>
                    <p>Try another name or clear the search to see your recent workspaces.</p>
                    <button
                      className="workspace-start__button workspace-start__button--secondary"
                      type="button"
                      onClick={() => setQuery('')}
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  <div className="workspace-start__rows">
                    {filteredWorkspaces.map(renderWorkspaceRow)}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </section>

      <WorkspaceNameDialog
        dialog={dialog}
        controller={controller}
        name={name}
        nameError={nameError}
        formId="workspace-start-name-form"
        variant="launcher"
        onClose={closeDialog}
        onNameChange={(nextName) => {
          setName(nextName);
          setNameError('');
          controller.clearError();
        }}
        onSubmit={submitName}
      />

      <WorkspaceActionDialog
        open={controller.pending !== null}
        action="delete"
        controller={controller}
        workspaceName={pendingWorkspace?.name}
        dirty={controller.pending?.dirty ?? false}
        variant="launcher"
        onClose={() => controller.cancelPending()}
        onConfirm={confirmDelete}
      />

      {enteringWorkspace ? (
        <div className="workspace-start__entering" role="status">
          <PixelGridLoader size="status" />
          <span>Opening workspace…</span>
        </div>
      ) : null}
    </main>
  );
}
