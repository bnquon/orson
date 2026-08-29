import { WarningCircle } from 'iconoir-react';
import type { ReactNode } from 'react';
import type { ScenarioSource, WorkspaceMode } from '../types';
import { handleTabListKeyDown } from './tabKeyboard';

interface ActiveScenarioSummary {
  name: string;
  rootTopic: string;
  source: ScenarioSource;
  sourceFilename: string;
  sourcePath: string;
  dirty: boolean;
}

interface ScenarioWarningSummary {
  count: number;
  dismissed: boolean;
  onRestore: () => void;
}

interface WorkspaceToolbarProps {
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  scenario: ActiveScenarioSummary;
  warnings: ScenarioWarningSummary;
  action: ReactNode;
}

export function WorkspaceToolbar({
  mode,
  onModeChange,
  scenario,
  warnings,
  action,
}: WorkspaceToolbarProps) {
  return (
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
          <div className="workspace-toolbar__scenario-name">
            <strong>{scenario.name}</strong>
            {scenario.dirty ? (
              <>
                <span className="workspace-toolbar__dirty" aria-hidden="true" />
                <span className="sr-only">Unsaved changes</span>
              </>
            ) : null}
          </div>
          <small title={scenario.sourcePath || scenario.sourceFilename}>
            <span
              className={`workspace-toolbar__source workspace-toolbar__source--${scenario.source}`}
            >
              {scenario.source === 'example'
                ? 'Example'
                : scenario.source === 'local'
                  ? 'Local file'
                  : 'Unsaved scenario'}
            </span>
            {scenario.sourceFilename ? <span>{scenario.sourceFilename}</span> : null}
            {scenario.sourceFilename ? <span aria-hidden="true">·</span> : null}
            <span>{scenario.rootTopic}</span>
          </small>
        </div>
        {warnings.count > 0 && warnings.dismissed ? (
          <button
            className="scenario-warning-indicator"
            type="button"
            aria-label={`Show ${warnings.count} scenario warning${warnings.count === 1 ? '' : 's'}`}
            title="Show scenario warnings"
            onClick={warnings.onRestore}
          >
            <WarningCircle width={16} height={16} />
          </button>
        ) : null}
      </div>
      <div className="workspace-toolbar__action">{action}</div>
    </div>
  );
}
