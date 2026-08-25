import { NavArrowDown, WarningCircle } from 'iconoir-react';
import type { ReactNode } from 'react';
import type { KafkaConnection, ScenarioDescriptor, WorkspaceMode } from '../types';
import { ScenarioBrowser } from './ScenarioBrowser';
import { handleTabListKeyDown } from './tabKeyboard';
import orsonIcon from '../../../assets/orson-icon.png';
import '../styles/shell.css';

// TODO: [Workspace] Scope open scenario tabs to a workspace when workspaces are introduced.
// TODO: [Database] Persist workspace and scenario metadata in SQLite when persistence is implemented.

interface WorkbenchShellProps {
  connection: KafkaConnection;
  scenarioName: string;
  scenarioRootTopic: string;
  scenarioWarningCount: number;
  scenarioWarningsDismissed: boolean;
  onRestoreScenarioWarnings: () => void;
  scenarios: ScenarioDescriptor[];
  selectedScenarioId: string | null;
  activeScenarioId: string;
  scenarioLoadingId: string | null;
  scenarioCatalogLoading: boolean;
  scenarioSelectionDisabled: boolean;
  onSelectScenario: (id: string) => void;
  connectionDialogOpen: boolean;
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  onConnectionToggle: () => void;
  action: ReactNode;
  workspace: ReactNode;
  previousRun: ReactNode;
  runStatus: string;
}

export function WorkbenchShell({
  connection,
  scenarioName,
  scenarioRootTopic,
  scenarioWarningCount,
  scenarioWarningsDismissed,
  onRestoreScenarioWarnings,
  scenarios,
  selectedScenarioId,
  activeScenarioId,
  scenarioLoadingId,
  scenarioCatalogLoading,
  scenarioSelectionDisabled,
  onSelectScenario,
  connectionDialogOpen,
  mode,
  onModeChange,
  onConnectionToggle,
  action,
  workspace,
  previousRun,
  runStatus,
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
          <img className="workbench-brand" src={orsonIcon} alt="" aria-hidden="true" />
          <span className="workbench-wordmark">orson</span>
          <span className="workbench-separator">/</span>
          <span className="workbench-context-label">Scenarios</span>
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
        <ScenarioBrowser
          scenarios={scenarios}
          selectedScenarioId={selectedScenarioId}
          activeScenarioId={activeScenarioId}
          scenarioLoadingId={scenarioLoadingId}
          scenarioCatalogLoading={scenarioCatalogLoading}
          scenarioSelectionDisabled={scenarioSelectionDisabled}
          onSelectScenario={onSelectScenario}
        />

        <main className="workbench-main">
          <div className="workspace-toolbar">
            <div className="workspace-toolbar__left">
              <div
                className="mode-switch"
                role="tablist"
                aria-label="Scenario view"
                data-active-mode={mode}
              >
                <button
                  className={`mode-switch__button ${mode === 'compose' ? 'mode-switch__button--active' : ''}`}
                  type="button"
                  role="tab"
                  id="workspace-mode-tab-compose"
                  tabIndex={mode === 'compose' ? 0 : -1}
                  aria-selected={mode === 'compose'}
                  aria-controls="workspace-view"
                  onClick={() => onModeChange('compose')}
                  onKeyDown={handleTabListKeyDown}
                >
                  Compose
                </button>
                <button
                  className={`mode-switch__button ${mode === 'flow' ? 'mode-switch__button--active' : ''}`}
                  type="button"
                  role="tab"
                  id="workspace-mode-tab-flow"
                  tabIndex={mode === 'flow' ? 0 : -1}
                  aria-selected={mode === 'flow'}
                  aria-controls="workspace-view"
                  onClick={() => onModeChange('flow')}
                  onKeyDown={handleTabListKeyDown}
                >
                  Flow
                </button>
              </div>
              <div className="workspace-toolbar__scenario">
                <strong>{scenarioName}</strong>
                <small>{scenarioRootTopic}</small>
              </div>
              {scenarioWarningCount > 0 && scenarioWarningsDismissed ? (
                <button
                  className="scenario-warning-indicator"
                  type="button"
                  aria-label={`Show ${scenarioWarningCount} scenario warning${scenarioWarningCount === 1 ? '' : 's'}`}
                  title="Show scenario warnings"
                  onClick={onRestoreScenarioWarnings}
                >
                  <WarningCircle width={16} height={16} />
                </button>
              ) : null}
            </div>
            <div className="workspace-toolbar__action">{action}</div>
          </div>
          <div
            className="workspace-view"
            id="workspace-view"
            role="tabpanel"
            aria-labelledby={`workspace-mode-tab-${mode}`}
            key={mode}
          >
            {workspace}
          </div>
        </main>

        {previousRun}
      </div>

      <footer className="workbench-statusbar">
        <span>Capture {runStatus}</span>
        <span>Scenario changes stay local</span>
      </footer>
    </div>
  );
}
