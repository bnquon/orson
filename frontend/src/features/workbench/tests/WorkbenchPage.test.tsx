// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WorkbenchPage } from '../WorkbenchPage';
import { initialScenario } from '../fixtures';
import { startRun } from '../../../api/run';
import { preflightErrorCodes } from '../../../api/result';
import type { ComposePanel } from '../components/ComposePanel';
import type { WorkbenchPageProps } from '../workbenchPageTypes';

vi.mock('../../../api/run', () => ({ startRun: vi.fn(), stopRun: vi.fn() }));
vi.mock('../../../../wailsjs/runtime/runtime', () => ({ EventsOn: () => () => undefined }));
vi.mock('../useRunHistory', () => ({
  useRunHistory: () => ({
    mode: 'current',
    summaries: [],
    selectedRun: null,
    selectedSummary: null,
    selectedRecordId: null,
    listStatus: 'ready',
    detailStatus: 'idle',
    operation: 'idle',
    error: null,
    setMode: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock('../components/ComposePanel', () => ({
  ComposePanel: (props: ComponentProps<typeof ComposePanel>) => (
    <form id="compose-form" onSubmit={props.onSubmit}>
      <output data-testid="draft">{props.draft.payload}</output>
      <output data-testid="connection">
        {props.connection.name}:{props.connection.status}
      </output>
      <button
        type="button"
        onClick={() => props.setDraft((draft) => ({ ...draft, payload: '{"edited":true}' }))}
      >
        Edit draft
      </button>
      <button type="submit">Test publish</button>
    </form>
  ),
}));

it('keeps the draft and connection after preflight failure and retries the edited draft', async () => {
  const noop = vi.fn();
  const props = {
    workspaceId: 'workspace',
    connection: {
      name: 'Local Kafka',
      brokers: ['localhost:9092'],
      clientId: 'orson',
      dialTimeoutSeconds: 5,
      status: 'connected',
    },
    scenario: {
      active: {
        id: 'scenario',
        relativePath: '',
        folderPath: '',
        name: 'Order flow',
        sourceFilename: 'order.yaml',
        source: 'example',
        sourcePath: '',
        localStatus: null,
        draft: initialScenario,
        warnings: [],
      },
      catalog: {
        examples: [],
        localScenarios: [],
        selectedScenarioId: 'scenario',
        selectedDescriptor: null,
        selectedLoadError: null,
        selectedDiagnostics: [],
        scenarioLoadingId: null,
        scenarioCatalogLoading: false,
        examplesExpanded: false,
        examplesDismissed: true,
        onExamplesExpandedChange: noop,
        onExamplesDismissedChange: noop,
      },
      files: {
        fileFeedback: {
          operation: 'idle',
          error: null,
          errorOperation: null,
          diagnostics: [],
          successMessage: null,
        },
        onSelectScenario: noop,
        onCreateScenario: noop,
        onExitUnsavedScenario: noop,
        onImportScenario: noop,
        onRemoveScenario: noop,
        onSaveScenario: noop,
        onSaveScenarioAs: noop,
        onClearFileFeedback: noop,
        onRetrySelectedScenario: noop,
      },
      folders: {
        localFolders: [],
        folderOperation: 'idle',
        folderError: null,
        onCreateFolder: noop,
        onRenameFolder: noop,
        onDeleteFolder: noop,
        onMoveFolder: noop,
        onReorderFolder: noop,
        onMoveScenario: noop,
        onClearFolderError: noop,
      },
    },
    shell: {
      workspaceSelector: null,
      connectionDialogOpen: false,
      onConnectionToggle: noop,
      onNavigateHome: noop,
    },
    onWorkspaceGuardChange: noop,
  } as WorkbenchPageProps;
  vi.mocked(startRun).mockResolvedValue({
    ok: false,
    error: {
      code: preflightErrorCodes.metadataUnavailable,
      message: 'Cannot check topics',
      retryable: true,
    },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const click = async (label: string) => {
    await act(async () => {
      const button = Array.from(host.querySelectorAll('button')).find(
        (item) => item.textContent === label,
      );
      expect(button).toBeDefined();
      button!.click();
      await Promise.resolve();
    });
  };
  try {
    act(() => root.render(<WorkbenchPage {...props} />));
    await click('Edit draft');
    await click('Test publish');
    expect(host.querySelector('[data-testid="draft"]')?.textContent).toBe('{"edited":true}');
    expect(host.querySelector('[data-testid="connection"]')?.textContent).toBe(
      'Local Kafka:connected',
    );
    expect(host.textContent).toContain('No run started');
    expect(host.querySelector('.run-context__timeline')).toBeNull();
    act(() =>
      root.render(
        <WorkbenchPage {...props} connection={{ ...props.connection, name: 'Fixed Kafka' }} />,
      ),
    );
    await click('Retry topic check');
    expect(startRun).toHaveBeenCalledTimes(2);
    expect(vi.mocked(startRun).mock.calls[1][0].payload).toBe('{"edited":true}');
    expect(host.querySelector('[data-testid="connection"]')?.textContent).toBe(
      'Fixed Kafka:connected',
    );
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
