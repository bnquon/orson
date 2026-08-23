import type { ReactNode } from 'react';
import {
  Database,
  Folder,
  MoreHoriz,
  NavArrowDown,
  Plus,
  Search,
  Settings,
  Terminal,
} from 'iconoir-react';
import type { KafkaConnection, WorkspaceMode } from '../types';
import { handleTabListKeyDown } from './tabKeyboard';
import '../styles/shell.css';

interface WorkbenchShellProps {
  connection: KafkaConnection;
  connectionDialogOpen: boolean;
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  onConnectionToggle: () => void;
  action: ReactNode;
  workspace: ReactNode;
  previousRun: ReactNode;
}

export function WorkbenchShell({
  connection,
  connectionDialogOpen,
  mode,
  onModeChange,
  onConnectionToggle,
  action,
  workspace,
  previousRun,
}: WorkbenchShellProps) {
  return (
    <div className="workbench-shell">
      <header className="workbench-topbar">
        <div className="workbench-topbar__group">
          <span className="workbench-brand" aria-label="Orson">
            O
          </span>
          <span className="workbench-wordmark">orson</span>
          <span className="workbench-separator">/</span>
          <button className="workbench-project-switcher" type="button">
            <span className="workbench-project-avatar">AC</span>
            <span>Acme Commerce</span>
            <NavArrowDown width={16} height={16} />
          </button>
        </div>
        <div className="workbench-topbar__group">
          <button
            className="workbench-environment"
            id="workbench-environment-selector"
            type="button"
            aria-label="Active Kafka connection"
            aria-expanded={connectionDialogOpen}
            onClick={onConnectionToggle}
          >
            <span className={`workbench-status-dot workbench-status-dot--${connection.status}`} />
            <span>{connection.name}</span>
            <span className="workbench-environment__broker">{connection.brokers.join(', ')}</span>
            <NavArrowDown width={16} height={16} />
          </button>
          <button
            className="workbench-icon-button"
            type="button"
            aria-label="Search"
            title="Search"
          >
            <Search />
          </button>
          <kbd className="workbench-shortcut">⌘ K</kbd>
          <span className="workbench-user-avatar">BQ</span>
        </div>
      </header>

      <div className="workbench-layout">
        <nav className="project-rail" aria-label="Projects">
          <button
            className="project-rail__item project-rail__item--active"
            type="button"
            aria-label="Acme Commerce"
          >
            AC
          </button>
          <button className="project-rail__item" type="button" aria-label="Ledger API">
            LA
          </button>
          <button className="project-rail__item" type="button" aria-label="Parcel Service">
            PS
          </button>
          <button className="project-rail__item" type="button" aria-label="Add project">
            <Plus width={20} height={20} />
          </button>
          <span className="project-rail__spacer" />
          <button className="project-rail__item" type="button" aria-label="Settings">
            <Settings width={20} height={20} />
          </button>
        </nav>

        <aside className="scenario-sidebar">
          <div className="scenario-sidebar__header">
            <div className="scenario-sidebar__title">
              <strong>Acme Commerce</strong>
              <button
                className="workbench-icon-button workbench-icon-button--compact"
                type="button"
                aria-label="Project menu"
              >
                <MoreHoriz width={16} height={16} />
              </button>
            </div>
            <label className="scenario-search">
              <Search width={16} height={16} />
              <span className="sr-only">Filter scenarios</span>
              <input type="search" placeholder="Filter scenarios" />
            </label>
          </div>
          <div className="scenario-sidebar__label">
            <span>Event scenarios</span>
            <button
              className="workbench-icon-button workbench-icon-button--compact"
              type="button"
              aria-label="Add scenario"
            >
              <Plus width={16} height={16} />
            </button>
          </div>
          <button className="scenario-row scenario-row--folder" type="button">
            <NavArrowDown width={16} height={16} /> <Folder width={16} height={16} /> Checkout
          </button>
          <button className="scenario-row scenario-row--child scenario-row--active" type="button">
            <span className="scenario-row__kind">EVT</span> Order placed
          </button>
          <button className="scenario-row scenario-row--child" type="button">
            <span className="scenario-row__kind">EVT</span> Payment failed
          </button>
          <button className="scenario-row scenario-row--child" type="button">
            <span className="scenario-row__kind">EVT</span> Cart abandoned
          </button>
          <button className="scenario-row scenario-row--folder" type="button">
            <span className="scenario-row__chevron">›</span> <Folder width={16} height={16} />{' '}
            Customers
          </button>
          <button className="scenario-row scenario-row--folder" type="button">
            <span className="scenario-row__chevron">›</span> <Folder width={16} height={16} />{' '}
            Inventory
          </button>
          <button className="scenario-row scenario-row--folder" type="button">
            <span className="scenario-row__chevron">›</span> <Folder width={16} height={16} />{' '}
            Fulfillment
          </button>
          <div className="scenario-sidebar__label">Project activity</div>
          <button className="scenario-row" type="button">
            <Terminal width={16} height={16} /> Recent sends{' '}
            <span className="scenario-row__count">12</span>
          </button>
          <button className="scenario-row" type="button">
            <Database width={16} height={16} /> Tracked events
          </button>
        </aside>

        <main className="workbench-main">
          <div className="document-tabs" role="tablist" aria-label="Open scenarios">
            <button
              className="document-tab document-tab--active"
              type="button"
              role="tab"
              aria-selected="true"
            >
              <span>EVT</span> Order placed <span aria-hidden="true">×</span>
            </button>
            <button className="document-tab" type="button" role="tab" aria-selected="false">
              <span>EVT</span> Payment failed <span aria-hidden="true">×</span>
            </button>
            <button
              className="workbench-icon-button workbench-icon-button--compact"
              type="button"
              aria-label="Open scenario"
            >
              <Plus width={16} height={16} />
            </button>
          </div>
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
                <strong>Order placed</strong>
                <small>order.created</small>
              </div>
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
        <span>Capture idle</span>
        <span>Scenario changes stay local</span>
      </footer>
    </div>
  );
}
