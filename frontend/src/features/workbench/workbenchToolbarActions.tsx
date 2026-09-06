import {
  CheckCircle,
  CodeBrackets,
  DotArrowRight,
  FloppyDiskArrowIn,
  InfoCircle,
  WarningCircle,
  Xmark,
} from 'iconoir-react';
import { LoadingDots } from '../../components/LoadingDots';
import { Tooltip } from '../../components/Tooltip';
import { ScenarioFileActions } from './components/ScenarioFileActions';
import type { WorkbenchPageState } from './useWorkbenchPage';
import type { ValidatableField } from './types';

export function workbenchToolbarActions(state: WorkbenchPageState) {
  const {
    connection,
    scenario,
    scenarioCatalogLoading,
    fileFeedback,
    onExitUnsavedScenario,
    mode,
    publishAttempted,
    run,
    history,
    validation,
    isRunActive,
    scenarioSelectionLoading,
    yamlPreviewLoading,
    yamlPreviewDisabled,
    yamlPreviewDisabledReason,
    fileOperations,
    showEmptyWorkbench,
    publishRun,
    openYamlPreview,
  } = state;
  const saveAsMissingItems = new Set<string>();
  const saveValidationLabels: Partial<Record<ValidatableField, string>> = {
    name: 'scenario name',
    rootTopic: 'root topic',
    watchedTopics: 'valid watched topics',
    headers: 'valid custom headers',
    payload: 'valid JSON payload',
    captureTimeoutSeconds: 'valid capture timeout',
  };
  for (const field of Object.keys(
    fileOperations.saveValidation.fieldErrors,
  ) as ValidatableField[]) {
    const item = saveValidationLabels[field];
    if (item !== undefined) saveAsMissingItems.add(item);
  }
  if (Object.keys(fileOperations.saveValidation.watchedTopicErrors).length > 0) {
    saveAsMissingItems.add('valid watched topics');
  }
  if (Object.keys(fileOperations.saveValidation.headerErrors).length > 0) {
    saveAsMissingItems.add('valid custom headers');
  }
  const saveAsHint =
    fileOperations.saveBlocker === 'invalid'
      ? `Missing or fix:\n${[...saveAsMissingItems].map((item) => `• ${item}`).join('\n')}`
      : fileOperations.saveAsDisabledReason;

  const fileActions = showEmptyWorkbench ? (
    <span />
  ) : scenario.source === 'unsaved' ? (
    <div className="scenario-file-actions scenario-file-actions--unsaved">
      <button
        className="scenario-file-button"
        type="button"
        onClick={onExitUnsavedScenario}
        disabled={
          isRunActive ||
          fileOperations.fileBusy ||
          scenarioCatalogLoading ||
          history.mode === 'historical'
        }
        title={
          isRunActive
            ? 'Stop the active run before exiting'
            : fileOperations.fileBusy
              ? 'Wait for the current scenario file operation to finish'
              : scenarioCatalogLoading
                ? 'Wait for the scenario refresh to finish'
                : history.mode === 'historical'
                  ? 'Return to the current workspace to edit scenarios'
                  : 'Exit without saving this scenario'
        }
      >
        <Xmark width={15} height={15} /> Exit without saving
      </button>
    </div>
  ) : (
    <ScenarioFileActions
      source={scenario.source}
      sourceFilename={scenario.sourceFilename}
      readOnly={history.mode === 'historical'}
      dirty={fileOperations.draftIsDirty}
      saveDisabled={fileOperations.saveDisabled}
      saveAsDisabled={fileOperations.saveDisabled}
      saveDisabledReason={fileOperations.saveDisabledReason}
      saveAsDisabledReason={fileOperations.saveAsDisabledReason}
      operation={fileFeedback.operation}
      onSave={() => void fileOperations.saveDraft()}
      onSaveAs={() => void fileOperations.saveDraftAs()}
      previewDisabled={yamlPreviewDisabled}
      previewDisabledReason={yamlPreviewDisabledReason}
      previewing={yamlPreviewLoading}
      onPreview={openYamlPreview}
    />
  );
  let publishTitle = `Publish to ${connection.name} · ${connection.brokers.join(', ')}`;
  if (fileOperations.fileBusy) {
    publishTitle = 'Wait for the scenario file operation to finish';
  } else if (scenarioCatalogLoading) {
    publishTitle = 'Wait for the scenario refresh to finish';
  } else if (scenarioSelectionLoading) {
    publishTitle = 'Wait for the selected scenario to finish loading';
  }
  const unsavedYamlPreviewAction = (
    <button
      className="compose-secondary-button"
      type="button"
      onClick={openYamlPreview}
      disabled={yamlPreviewDisabled}
      title={yamlPreviewDisabled ? yamlPreviewDisabledReason : 'View canonical YAML'}
    >
      {yamlPreviewLoading ? (
        <LoadingDots size="inline" />
      ) : (
        <CodeBrackets width={16} height={16} aria-hidden="true" />
      )}
      View YAML
    </button>
  );
  const publishAction = showEmptyWorkbench ? (
    <span />
  ) : history.mode === 'historical' ? (
    <span className="publish-summary" aria-label="Historical run is read-only">
      Read-only run
    </span>
  ) : run.state.status === 'checking' ? (
    <button className="publish-button" type="button" disabled aria-busy="true">
      <LoadingDots size="inline" /> Checking Kafka topics
    </button>
  ) : isRunActive ? (
    <>
      {scenario.source === 'unsaved' ? unsavedYamlPreviewAction : null}
      <button
        className="publish-button publish-button--stop"
        type="button"
        onClick={() => void run.stopRun()}
        title="Stop the active run"
      >
        <LoadingDots size="inline" /> Stop
      </button>
    </>
  ) : scenario.source === 'unsaved' ? (
    <span className="workspace-toolbar__save-action">
      {fileOperations.saveDisabled ? (
        <Tooltip label="Why Save as is unavailable" content={saveAsHint} interactive multiline>
          <InfoCircle width={16} height={16} aria-hidden="true" />
        </Tooltip>
      ) : null}
      {unsavedYamlPreviewAction}
      <button
        className="publish-button"
        type="button"
        onClick={() => void fileOperations.saveDraftAs()}
        disabled={fileOperations.saveDisabled}
        title={
          fileOperations.saveDisabled
            ? fileOperations.saveAsDisabledReason
            : 'Save scenario as YAML'
        }
      >
        <FloppyDiskArrowIn width={18} height={18} /> Save as
      </button>
    </span>
  ) : (
    <>
      <span
        className={`publish-summary ${publishAttempted && validation.issueCount > 0 ? 'publish-summary--invalid' : ''}`}
        aria-live="polite"
      >
        {publishAttempted ? (
          validation.issueCount > 0 ? (
            <>
              <WarningCircle width={16} height={16} /> {validation.issueCount}{' '}
              {validation.issueCount === 1 ? 'issue' : 'issues'}
            </>
          ) : (
            <>
              <CheckCircle width={16} height={16} /> Ready
            </>
          )
        ) : null}
      </span>
      <button
        className="publish-button"
        type={mode === 'compose' ? 'submit' : 'button'}
        form={mode === 'compose' ? 'compose-form' : undefined}
        onClick={mode === 'flow' ? publishRun : undefined}
        disabled={fileOperations.fileBusy || scenarioSelectionLoading}
        title={publishTitle}
      >
        Publish <DotArrowRight width={20} height={20} strokeWidth={1.5} />
      </button>
    </>
  );

  return { fileActions, publishAction };
}
