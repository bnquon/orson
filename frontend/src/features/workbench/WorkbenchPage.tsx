import { Modal, ModalActions, ModalButton } from '../../components/Modal';
import { Toast } from '../../components/Toast';
import { ComposePanel } from './components/ComposePanel';
import { FolderNameDialog } from './components/FolderNameDialog';
import { FlowPanel } from './components/FlowPanel';
import { HistoricalRunPanel } from './components/HistoricalRunPanel';
import { HistoricalRunToolbar } from './components/HistoricalRunToolbar';
import { RunContextPanel } from './components/RunContextPanel';
import { ScenarioBrowser } from './components/ScenarioBrowser';
import { ScenarioYamlPreviewModal } from './components/ScenarioYamlPreviewModal';
import { WorkbenchShell } from './components/WorkbenchShell';
import { WorkspaceToolbar } from './components/WorkspaceToolbar';
import {
  ScenarioDiagnostics,
  ScenarioFileOperationError,
  ScenarioSelectionLoadError,
} from './components/ScenarioLoadState';
import { formatStatusLabel } from './runStatus';
import type { WorkbenchPageProps } from './workbenchPageTypes';
import { useWorkbenchPage } from './useWorkbenchPage';
import { workbenchToolbarActions } from './workbenchToolbarActions';
import './styles/controls.css';

export function WorkbenchPage(props: WorkbenchPageProps) {
  const state = useWorkbenchPage(props);
  const {
    connection,
    emptyWorkbench,
    scenario,
    examples,
    localScenarios,
    selectedScenarioId,
    selectedDescriptor,
    selectedLoadError,
    selectedDiagnostics,
    scenarioLoadingId,
    scenarioCatalogLoading,
    examplesExpanded,
    examplesDismissed,
    onExamplesExpandedChange,
    onExamplesDismissedChange,
    fileFeedback,
    onCreateScenario,
    onImportScenario,
    onRemoveScenario,
    onRetrySelectedScenario,
    localFolders,
    folderOperation,
    folderError,
    onRenameFolder,
    onDeleteFolder,
    onMoveFolder,
    onReorderFolder,
    onMoveScenario,
    onClearFolderError,
    connectionDialogOpen,
    onConnectionToggle,
    onNavigateHome,
    workspaceSelector,
    mode,
    setMode,
    folderParentId,
    folderName,
    setFolderName,
    folderNameError,
    draft,
    setDraft,
    activeEditorTab,
    setActiveEditorTab,
    touched,
    pendingHistoricalLoad,
    historyLoadFeedback,
    setHistoryLoadFeedback,
    composeConfigHeight,
    setComposeConfigHeight,
    yamlPreviewOpen,
    setYamlPreviewOpen,
    yamlPreview,
    rootTopicEditRef,
    jsonValidation,
    run,
    history,
    scenarioWarningsDismissed,
    dismissScenarioWarnings,
    restoreScenarioWarnings,
    jsonValidationPending,
    validation,
    liveRun,
    flowModel,
    topologyEditing,
    selectedEvent,
    fileOperations,
    flowEditingDisabled,
    flowEditingDisabledReason,
    historyLoadDisabledReason,
    historyLoadDisabled,
    showEmptyWorkbench,
    openFolderDialog,
    closeFolderDialog,
    submitFolder,
    folderParentName,
    folderMutationDisabled,
    touchField,
    touchWatchedTopic,
    touchHeader,
    requestHistoricalDraftLoad,
    cancelPendingDraftReplacement,
    confirmPendingDraftReplacement,
    publishRun,
    handlePublish,
  } = state;
  const { fileActions, publishAction } = workbenchToolbarActions(state);

  const scenarioSidebar = (
    <ScenarioBrowser
      examples={examples}
      localScenarios={localScenarios}
      selectedScenarioId={selectedScenarioId}
      activeScenarioId={scenario.id}
      activeScenarioName={showEmptyWorkbench ? '' : draft.name}
      activeScenarioUnsaved={scenario.source === 'unsaved' && !emptyWorkbench}
      scenarioLoadingId={scenarioLoadingId}
      scenarioCatalogLoading={scenarioCatalogLoading}
      readOnly={history.mode === 'historical'}
      examplesExpanded={examplesExpanded}
      examplesDismissed={examplesDismissed}
      onExamplesExpandedChange={onExamplesExpandedChange}
      onExamplesDismissedChange={onExamplesDismissedChange}
      scenarioSelectionDisabled={fileOperations.scenarioSelectionDisabled}
      scenarioRemovalDisabled={scenario.source === 'unsaved'}
      activeScenarioDirty={showEmptyWorkbench ? false : fileOperations.draftIsDirty}
      fileOperation={fileFeedback.operation}
      fileError={fileFeedback.error}
      fileErrorOperation={fileFeedback.errorOperation}
      fileActions={fileActions}
      onSelectScenario={fileOperations.requestScenarioSelection}
      onNewScenario={showEmptyWorkbench ? onCreateScenario : fileOperations.requestNewScenario}
      onImportScenario={showEmptyWorkbench ? onImportScenario : fileOperations.requestImport}
      onRemoveScenario={onRemoveScenario}
      localFolders={localFolders}
      folderOperation={folderOperation}
      folderError={folderParentId === null ? folderError : null}
      onClearFolderError={onClearFolderError}
      onRequestCreateFolder={folderMutationDisabled ? undefined : openFolderDialog}
      onRenameFolder={onRenameFolder}
      onDeleteFolder={onDeleteFolder}
      onMoveFolder={onMoveFolder}
      onReorderFolder={onReorderFolder}
      onMoveScenario={onMoveScenario}
    />
  );
  const workspaceToolbar = showEmptyWorkbench ? (
    <div />
  ) : history.mode === 'historical' && history.selectedSummary !== null ? (
    <HistoricalRunToolbar
      summary={history.selectedSummary}
      onReturnToCurrent={() => history.setMode('current')}
      onLoadIntoCompose={requestHistoricalDraftLoad}
      loadDisabled={historyLoadDisabled}
      loadDisabledReason={historyLoadDisabledReason}
    />
  ) : (
    <WorkspaceToolbar
      mode={mode}
      onModeChange={setMode}
      scenario={{
        name: draft.name,
        rootTopic: draft.rootTopic,
        source: scenario.source,
        sourceFilename: scenario.sourceFilename,
        sourcePath: scenario.sourcePath,
        dirty: fileOperations.draftIsDirty,
      }}
      warnings={{
        count: scenario.warnings.length,
        dismissed: scenarioWarningsDismissed,
        onRestore: restoreScenarioWarnings,
      }}
      action={publishAction}
    />
  );

  const scenarioDiagnostics = (
    <>
      {fileFeedback.error ? (
        <ScenarioFileOperationError
          error={fileFeedback.error}
          diagnostics={fileFeedback.diagnostics}
          onDismiss={fileOperations.clearFileFeedback}
        />
      ) : null}
      <ScenarioDiagnostics
        warnings={scenario.warnings}
        sourceFilename={scenario.sourceFilename}
        dismissed={scenarioWarningsDismissed}
        onDismiss={dismissScenarioWarnings}
      />
      {selectedLoadError && selectedDescriptor?.id !== scenario.id ? (
        <ScenarioSelectionLoadError
          descriptor={selectedDescriptor}
          error={selectedLoadError}
          diagnostics={selectedDiagnostics}
          onRetry={selectedLoadError.retryable ? () => void onRetrySelectedScenario() : undefined}
        />
      ) : null}
    </>
  );
  const historicalLoadPending = pendingHistoricalLoad !== null;
  const discardModalOpen = historicalLoadPending || fileOperations.pendingScenarioAction !== null;
  const discardModalDescription = historicalLoadPending
    ? 'Loading this historical run will replace the current unsaved draft.'
    : fileOperations.pendingScenarioAction?.kind === 'import'
      ? 'Importing another file will replace the current editable draft if it succeeds.'
      : fileOperations.pendingScenarioAction?.kind === 'new'
        ? 'Creating a new scenario will replace the current editable draft.'
        : 'Switching scenarios will replace the current editable draft.';
  const discardModalConfirmLabel = historicalLoadPending
    ? 'Discard changes and load'
    : 'Discard changes';
  const discardModalCopy = historicalLoadPending ? (
    <p className="scenario-switch-copy">
      Any unsaved edits to <strong>{draft.name}</strong> will be lost. The historical run and any
      scenario file on disk will remain unchanged.
    </p>
  ) : (
    <p className="scenario-switch-copy">
      Any unsaved edits to <strong>{draft.name}</strong> will be lost after the next scenario loads
      successfully.{' '}
      {fileOperations.pendingScenarioAction?.kind === 'new'
        ? 'This scenario has not been saved to disk.'
        : scenario.source === 'example'
          ? 'The example file remains unchanged.'
          : 'The file on disk remains unchanged.'}
    </p>
  );

  return (
    <>
      <WorkbenchShell
        connection={connection}
        workspaceSelector={workspaceSelector}
        onNavigateHome={onNavigateHome}
        connectionDialogOpen={connectionDialogOpen}
        onConnectionToggle={onConnectionToggle}
        sidebar={scenarioSidebar}
        toolbar={workspaceToolbar}
        workspaceMode={mode}
        workspaceAriaLabel={
          showEmptyWorkbench
            ? 'No scenario selected'
            : history.mode === 'historical'
              ? 'Historical run detail'
              : undefined
        }
        workspaceInert={
          fileFeedback.operation === 'importing' || fileFeedback.operation === 'removing'
        }
        workspace={
          showEmptyWorkbench ? (
            <>
              {scenarioDiagnostics}
              <div className="workspace-empty-state" role="status">
                <strong>No scenario selected</strong>
                <span>Select a scenario or import a YAML file from the sidebar to begin.</span>
              </div>
            </>
          ) : history.mode === 'historical' ? (
            <HistoricalRunPanel
              run={history.selectedRun}
              detailStatus={history.detailStatus}
              errorMessage={history.error?.message ?? null}
              selectedRecordId={history.selectedRecordId}
              onSelectRecord={history.selectRecord}
              onBackToHistory={() => history.setMode('history')}
            />
          ) : mode === 'compose' ? (
            <>
              {scenarioDiagnostics}
              <ComposePanel
                connection={connection}
                draft={draft}
                setDraft={setDraft}
                rootTopicEditRef={rootTopicEditRef}
                activeEditorTab={activeEditorTab}
                onEditorTabChange={setActiveEditorTab}
                touched={touched}
                validation={validation}
                jsonError={jsonValidation.error}
                jsonValidationPending={jsonValidationPending}
                configHeight={composeConfigHeight}
                onConfigHeightChange={setComposeConfigHeight}
                onReviewConnection={onConnectionToggle}
                onTouchField={touchField}
                onTouchWatchedTopic={touchWatchedTopic}
                onTouchHeader={touchHeader}
                onSubmit={handlePublish}
              />
            </>
          ) : (
            <>
              {scenarioDiagnostics}
              <FlowPanel
                model={flowModel}
                selectedRecordId={run.state.selectedRecordId}
                onSelectRecord={(recordId) => run.selectRecord(recordId)}
                editingDisabled={flowEditingDisabled}
                editingDisabledReason={flowEditingDisabledReason}
                onAddRootTopic={topologyEditing.addRoot}
                onAddWatchedTopic={topologyEditing.addWatched}
                onRenameTopic={topologyEditing.renameTopic}
                onRemoveTopic={topologyEditing.removeTopic}
                onCreateEdge={topologyEditing.createEdge}
                onRemoveEdge={topologyEditing.removeEdge}
              />
            </>
          )
        }
        previousRun={
          <RunContextPanel
            onRetryPreflight={publishRun}
            currentRun={liveRun}
            currentSelectedEventId={run.state.selectedRecordId}
            currentSelectedEvent={selectedEvent}
            onSelectCurrentEvent={(recordId) => run.selectRecord(recordId)}
            history={history}
          />
        }
        runStatus={formatStatusLabel(run.state.status)}
        runStatusLabel={history.mode === 'historical' ? 'Viewing historical run' : undefined}
        statusDetail={
          showEmptyWorkbench
            ? 'Select a scenario to begin'
            : history.mode === 'historical'
              ? 'Read-only snapshot · return to the current workspace to edit'
              : scenario.source === 'local'
                ? 'Imported files are remembered for this session'
                : scenario.source === 'unsaved'
                  ? 'Unsaved scenario · save as YAML to keep it'
                  : 'Examples are read-only'
        }
      />
      <FolderNameDialog
        open={folderParentId !== null}
        parentName={folderParentName}
        value={folderName}
        error={folderError?.message || folderNameError}
        busy={folderOperation === 'creating'}
        onChange={setFolderName}
        onClose={closeFolderDialog}
        onSubmit={submitFolder}
      />
      {yamlPreviewOpen ? (
        <ScenarioYamlPreviewModal
          open
          preview={yamlPreview}
          onClose={() => setYamlPreviewOpen(false)}
        />
      ) : null}
      {fileFeedback.successMessage ? (
        <Toast
          message={fileFeedback.successMessage}
          tone="success"
          onDismiss={fileOperations.clearFileFeedback}
        />
      ) : null}
      {run.historyError ? (
        <Toast
          message={run.historyError.message}
          tone="error"
          onDismiss={() => run.clearHistoryError()}
        />
      ) : null}
      {historyLoadFeedback !== null ? (
        <Toast
          message={historyLoadFeedback}
          tone="success"
          onDismiss={() => setHistoryLoadFeedback(null)}
        />
      ) : null}
      <Modal
        open={discardModalOpen}
        title="Discard local changes?"
        description={discardModalDescription}
        onClose={cancelPendingDraftReplacement}
        footer={
          <ModalActions>
            <ModalButton type="button" onClick={cancelPendingDraftReplacement}>
              Cancel
            </ModalButton>
            <ModalButton tone="danger" type="button" onClick={confirmPendingDraftReplacement}>
              {discardModalConfirmLabel}
            </ModalButton>
          </ModalActions>
        }
      >
        {discardModalCopy}
      </Modal>
    </>
  );
}
