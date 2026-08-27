import { NavArrowDown } from 'iconoir-react';
import type { ReactNode } from 'react';
import type { KafkaConnection, WorkspaceMode } from '../types';
import orsonIcon from '../../../assets/orson-icon.png';
import '../styles/shell.css';

// TODO: [Workspace] Scope open scenario tabs when multi-tab workspaces are introduced.

interface WorkbenchShellProps {
  connection: KafkaConnection;
  workspaceSelector: ReactNode;
  onNavigateHome: () => void;
  connectionDialogOpen: boolean;
  onConnectionToggle: () => void;
  sidebar: ReactNode;
  toolbar: ReactNode;
  workspace: ReactNode;
  workspaceMode: WorkspaceMode;
  workspaceAriaLabel?: string;
  workspaceInert: boolean;
  previousRun: ReactNode;
  runStatus: string;
  runStatusLabel?: string;
  statusDetail: string;
}

export function WorkbenchShell({
  connection,
  workspaceSelector,
  onNavigateHome,
  connectionDialogOpen,
  onConnectionToggle,
  sidebar,
  toolbar,
  workspace,
  workspaceMode,
  workspaceAriaLabel,
  workspaceInert,
  previousRun,
  runStatus,
  runStatusLabel,
  statusDetail,
}: WorkbenchShellProps) {
  const brokerSummary =
    connection.brokers.length > 1
      ? `${connection.brokers[0]} +${connection.brokers.length - 1}`
      : (connection.brokers[0] ?? 'No broker');
  const connectionDetails = `${connection.name} · ${connection.brokers.join(', ')}`;

  return (
    <div className="workbench-shell">
      <header className="workbench-topbar">
        <div className="workbench-topbar__group">
          <button
            className="workbench-home"
            type="button"
            aria-label="Open workspace launcher"
            title="Open workspace launcher"
            onClick={onNavigateHome}
          >
            <img className="workbench-brand" src={orsonIcon} alt="" aria-hidden="true" />
            <span className="workbench-wordmark">orson</span>
          </button>
          <span className="workbench-separator">/</span>
          {workspaceSelector}
        </div>
        <div className="workbench-topbar__group workbench-topbar__group--right">
          <button
            className="workbench-environment"
            id="workbench-environment-selector"
            type="button"
            aria-label={`Active Kafka connection: ${connectionDetails}`}
            aria-expanded={connectionDialogOpen}
            title={connectionDetails}
            onClick={onConnectionToggle}
          >
            <span className={`workbench-status-dot workbench-status-dot--${connection.status}`} />
            <span className="workbench-environment__details">
              <span className="workbench-environment__name">{connection.name}</span>
              <span className="workbench-environment__broker">{brokerSummary}</span>
            </span>
            <NavArrowDown width={16} height={16} />
          </button>
          <span className="workbench-user-avatar">BQ</span>
        </div>
      </header>

      <div className="workbench-layout">
        {sidebar}
        <main className="workbench-main">
          {toolbar}
          <div
            className="workspace-view"
            id="workspace-view"
            role="tabpanel"
            {...(workspaceAriaLabel === undefined
              ? { 'aria-labelledby': `workspace-mode-tab-${workspaceMode}` }
              : { 'aria-label': workspaceAriaLabel })}
            inert={workspaceInert}
            key={workspaceAriaLabel ?? workspaceMode}
          >
            {workspace}
          </div>
        </main>
        {previousRun}
      </div>

      <footer className="workbench-statusbar">
        <span>{runStatusLabel ?? `Capture ${runStatus}`}</span>
        <span>{statusDetail}</span>
      </footer>
    </div>
  );
}
