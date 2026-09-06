// @vitest-environment jsdom

import {
  act,
  type Dispatch,
  type SetStateAction,
  type SubmitEvent,
  useEffect,
  useState,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { api } from '../../../../wailsjs/go/models';
import { WorkbenchPage } from '../WorkbenchPage';
import { initialRunState } from '../runReducer';
import type { HistoricalRun } from '../historyTypes';
import type { LoadedScenario, ScenarioDraft } from '../types';
import type { RunHistoryController } from '../useRunHistory';
import type { WorkbenchPageProps } from '../workbenchPageTypes';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

const runApiState = vi.hoisted(() => ({ requests: [] as api.RunRequest[] }));

vi.mock('../../../api/run', () => ({
  startRun: (request: api.RunRequest) => {
    runApiState.requests.push(request);
    return Promise.resolve({
      ok: false as const,
      error: { code: 'publish_failed', message: 'Stopped after test request', retryable: false },
    });
  },
  stopRun: () => Promise.resolve({ ok: true as const, data: {} }),
}));
vi.mock('../../../../wailsjs/runtime/runtime', () => ({ EventsOn: () => () => undefined }));

let historyController: RunHistoryController;
let rerenderWorkbench: (() => void) | null = null;

vi.mock('../useRunHistory', () => ({
  useRunHistory: () => historyController,
}));

vi.mock('../components/ComposePanel', () => ({
  ComposePanel: (props: {
    draft: ScenarioDraft;
    setDraft: Dispatch<SetStateAction<ScenarioDraft>>;
    onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  }) => (
    <form id="compose-form" onSubmit={props.onSubmit}>
      <output data-testid="loaded-draft">{JSON.stringify(props.draft)}</output>
      <button
        type="button"
        onClick={() =>
          props.setDraft((draft) => ({ ...draft, payload: '{"editedAfterLoad":true}' }))
        }
      >
        Edit loaded draft
      </button>
      <button type="submit">Submit Compose</button>
    </form>
  ),
}));

const historicalScenario: ScenarioDraft = {
  name: 'Recorded checkout flow',
  rootTopic: 'orders.created',
  watchedTopics: [
    { id: 'topic-0', name: 'payments.captured' },
    { id: 'topic-1', name: 'inventory.reserved' },
  ],
  topology: [{ id: 'observed-edge', from: 'orders.created', to: 'payments.captured' }],
  configuredTopology: [
    { id: 'observed-edge', from: 'orders.created', to: 'payments.captured' },
    { id: 'warning-edge', from: 'missing.topic', to: 'inventory.reserved' },
  ],
  messageKey: 'order-42',
  headers: [
    { id: 'header-0', name: 'content-type', value: 'application/json', protected: false },
    { id: 'header-1', name: 'x-tenant-id', value: 'tenant-7', protected: false },
  ],
  correlationHeader: 'x-flow-id',
  payload: '{"orderId":"42"}',
  captureTimeoutSeconds: '27',
};

const historicalRun: HistoricalRun = {
  summary: {
    id: 'historical-run-42',
    scenarioName: historicalScenario.name,
    scenarioSource: 'local',
    scenarioId: 'local:scenario-that-no-longer-exists',
    scenarioPath: '/tmp/scenario-that-no-longer-exists.yaml',
    rootTopic: historicalScenario.rootTopic,
    status: 'completed',
    startedAt: '2026-08-27T07:49:37.051Z',
    finishedAt: '2026-08-27T07:49:39.051Z',
    durationMs: 2_000,
    eventCount: 1,
    outcome: '1 event captured',
    failureStage: null,
    failureMessage: null,
    connectionName: 'Local Kafka',
  },
  scenario: historicalScenario,
  run: {
    ...initialRunState,
    runId: 'historical-run-42',
    status: 'completed',
    rootRecord: {
      topic: historicalScenario.rootTopic,
      key: historicalScenario.messageKey,
      value: historicalScenario.payload,
      headers: [{ key: 'x-flow-id', value: 'old-generated-correlation-id' }],
      partition: 0,
      offset: '14',
      timestamp: '2026-08-27T07:49:38.051Z',
    },
    records: [],
  },
  records: [],
};

const currentDraft: ScenarioDraft = {
  name: 'Current scenario',
  rootTopic: 'current.root',
  watchedTopics: [],
  topology: [],
  configuredTopology: [],
  messageKey: '',
  headers: [
    { id: 'current-header', name: 'content-type', value: 'application/json', protected: false },
  ],
  correlationHeader: 'x-correlation-id',
  payload: '{"current":true}',
  captureTimeoutSeconds: '10',
};

const currentLocalScenario: LoadedScenario = {
  id: 'local:current',
  relativePath: 'current.yaml',
  folderPath: '',
  name: currentDraft.name,
  sourceFilename: 'current.yaml',
  source: 'local',
  sourcePath: '/tmp/current.yaml',
  localStatus: 'available',
  draft: currentDraft,
  warnings: [],
};

function createUnsavedScenarioFixture(draft: ScenarioDraft): LoadedScenario {
  return {
    id: 'scenario-test-unsaved',
    relativePath: '',
    folderPath: '',
    name: draft.name,
    sourceFilename: '',
    source: 'unsaved',
    sourcePath: '',
    localStatus: null,
    draft: {
      ...draft,
      watchedTopics: draft.watchedTopics.map((topic) => ({ ...topic })),
      topology: draft.topology.map((edge) => ({ ...edge })),
      configuredTopology: draft.configuredTopology.map((edge) => ({ ...edge })),
      headers: draft.headers.map((header) => ({ ...header })),
    },
    warnings: [],
  };
}

const noop = () => undefined;
let loadedDraftRequests: ScenarioDraft[];
let selectedScenarioIds: string[];

function createHistoryController(): RunHistoryController {
  const controller: RunHistoryController = {
    mode: 'historical',
    summaries: [historicalRun.summary],
    selectedSummary: historicalRun.summary,
    selectedRun: historicalRun,
    selectedRecordId: null,
    listStatus: 'ready',
    detailStatus: 'ready',
    operation: 'idle',
    error: null,
    setMode: vi.fn((mode: RunHistoryController['mode']) => {
      controller.mode = mode;
      rerenderWorkbench?.();
    }),
    selectRecord: vi.fn(),
    selectRun: vi.fn(() => Promise.resolve()),
    refresh: vi.fn(() => Promise.resolve()),
    deleteRun: vi.fn(() => Promise.resolve(true)),
    clearAll: vi.fn(() => Promise.resolve(true)),
  };
  return controller;
}

function scenarioProps(
  active: LoadedScenario,
  onLoadDraftAsUnsaved: (draft: ScenarioDraft) => void,
): WorkbenchPageProps['scenario'] {
  return {
    active,
    catalog: {
      examples: [],
      localScenarios: [],
      selectedScenarioId: active.source === 'unsaved' ? null : active.id,
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
      onSelectScenario: (id) => {
        selectedScenarioIds.push(id);
        return Promise.resolve();
      },
      onCreateScenario: noop,
      onLoadDraftAsUnsaved,
      onExitUnsavedScenario: noop,
      onImportScenario: vi.fn(() => Promise.resolve('cancelled' as const)),
      onRemoveScenario: vi.fn(() => Promise.resolve('cancelled' as const)),
      onSaveScenario: vi.fn(() => Promise.resolve('cancelled' as const)),
      onSaveScenarioAs: vi.fn(() => Promise.resolve('cancelled' as const)),
      onClearFileFeedback: noop,
      onRetrySelectedScenario: vi.fn(() => Promise.resolve()),
    },
    folders: {
      localFolders: [],
      folderOperation: 'idle',
      folderError: null,
      onCreateFolder: vi.fn(() => Promise.resolve(false)),
      onRenameFolder: vi.fn(() => Promise.resolve(false)),
      onDeleteFolder: vi.fn(() => Promise.resolve(false)),
      onMoveFolder: vi.fn(() => Promise.resolve(false)),
      onReorderFolder: vi.fn(() => Promise.resolve(false)),
      onMoveScenario: vi.fn(() => Promise.resolve(false)),
      onClearFolderError: noop,
    },
  };
}

function Harness({ initialScenario }: { initialScenario: LoadedScenario }) {
  const [active, setActive] = useState(initialScenario);
  const [, setRevision] = useState(0);
  useEffect(() => {
    rerenderWorkbench = () => setRevision((revision) => revision + 1);
    return () => {
      rerenderWorkbench = null;
    };
  }, []);

  const loadDraftAsUnsaved = (draft: ScenarioDraft) => {
    loadedDraftRequests.push(draft);
    setActive(createUnsavedScenarioFixture(draft));
  };

  return (
    <WorkbenchPage
      workspaceId="workspace-1"
      connection={{
        name: 'Local Kafka',
        brokers: ['localhost:9092'],
        clientId: 'orson',
        dialTimeoutSeconds: 5,
        status: 'connected',
      }}
      scenario={scenarioProps(active, loadDraftAsUnsaved)}
      shell={{
        workspaceSelector: null,
        connectionDialogOpen: false,
        onConnectionToggle: noop,
        onNavigateHome: noop,
      }}
      onWorkspaceGuardChange={noop}
    />
  );
}

let host: HTMLDivElement;
let root: Root;

function button(label: string, scope: ParentNode = document): HTMLButtonElement {
  const match = Array.from(scope.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (match === undefined) throw new Error(`button named ${label} was not found`);
  return match;
}

async function click(label: string, scope: ParentNode = document) {
  await act(async () => {
    button(label, scope).click();
    await Promise.resolve();
  });
}

function renderedDraft(): ScenarioDraft {
  const output = host.querySelector('[data-testid="loaded-draft"]');
  if (!(output instanceof HTMLOutputElement)) throw new Error('loaded draft output was not found');
  return JSON.parse(output.textContent) as ScenarioDraft;
}

function openDialog(): HTMLElement {
  const dialog = document.body.querySelector('[role="dialog"]');
  if (!(dialog instanceof HTMLElement)) throw new Error('expected an open dialog');
  return dialog;
}

function renderWorkbench(initialScenario: LoadedScenario) {
  act(() => root.render(<Harness initialScenario={initialScenario} />));
}

beforeEach(() => {
  historyController = createHistoryController();
  loadedDraftRequests = [];
  selectedScenarioIds = [];
  runApiState.requests = [];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
  rerenderWorkbench = null;
  vi.clearAllMocks();
});

describe('loading a historical run into Compose', () => {
  it.each([
    {
      name: 'historical detail loading',
      prepare: () => {
        historyController.detailStatus = 'loading';
        historyController.selectedRun = null;
      },
      reason: 'Wait for the historical run to finish loading',
    },
    {
      name: 'history operation active',
      prepare: () => {
        historyController.operation = 'deleting';
      },
      reason: 'Wait for the current history operation to finish',
    },
  ])('disables the action while $name', ({ prepare, reason }) => {
    prepare();
    renderWorkbench(currentLocalScenario);

    const action = button('Load into Compose');
    expect(action.disabled).toBe(true);
    expect(action.title).toBe(reason);
  });

  it('loads the complete persisted snapshot as a detached unsaved draft without publishing', async () => {
    const historicalBeforeLoad = structuredClone(historicalRun);
    renderWorkbench(currentLocalScenario);

    await click('Load into Compose');

    expect(renderedDraft()).toEqual(historicalScenario);
    expect(host.textContent).toContain('Compose');
    expect(host.textContent).toContain('Unsaved scenario · save as YAML to keep it');
    expect(
      host.querySelector('[aria-label="Run context mode"] [aria-selected="true"]')?.textContent,
    ).toContain('Current run');
    expect(document.body.textContent).toContain(
      'Historical run loaded into Compose as an unsaved draft.',
    );
    expect(runApiState.requests).toEqual([]);
    expect(selectedScenarioIds).toEqual([]);
    expect(loadedDraftRequests).toEqual([historicalScenario]);

    await click('Edit loaded draft', host);
    expect(renderedDraft().payload).toBe('{"editedAfterLoad":true}');
    expect(historicalRun).toEqual(historicalBeforeLoad);
  });

  it('preserves the dirty draft and historical view when replacement is cancelled', async () => {
    const unsavedCurrent = createUnsavedScenarioFixture(currentDraft);
    renderWorkbench(unsavedCurrent);

    await click('Load into Compose');
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain(
      'Loading this historical run will replace the current unsaved draft.',
    );
    expect(dialog?.textContent).toContain(
      'The historical run and any scenario file on disk will remain unchanged.',
    );

    await click('Cancel', dialog ?? document);

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain('Historical run');
    expect(loadedDraftRequests).toEqual([]);
    expect(historyController.setMode).not.toHaveBeenCalled();

    await click('Current workspace', host);
    expect(renderedDraft()).toEqual(currentDraft);
  });

  it('replaces a dirty draft after confirmation and returns to Compose', async () => {
    renderWorkbench(createUnsavedScenarioFixture(currentDraft));

    await click('Load into Compose');
    await click('Discard changes and load', openDialog());

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(renderedDraft()).toEqual(historicalScenario);
    expect(loadedDraftRequests).toHaveLength(1);
    expect(historyController.mode).toBe('current');
    expect(document.body.textContent).toContain(
      'Historical run loaded into Compose as an unsaved draft.',
    );
  });

  it('uses the normal publish request without reusing the recorded correlation ID', async () => {
    renderWorkbench(currentLocalScenario);
    await click('Load into Compose');

    await click('Submit Compose', host);

    expect(runApiState.requests).toHaveLength(1);
    const request = runApiState.requests[0];
    if (request === undefined) throw new Error('expected one published run request');
    expect(request).toMatchObject({
      rootTopic: 'orders.created',
      messageKey: 'order-42',
      correlationHeader: 'x-flow-id',
      captureTimeoutSeconds: 27,
      headers: [
        { key: 'content-type', value: 'application/json' },
        { key: 'x-tenant-id', value: 'tenant-7' },
      ],
      scenarioSnapshot: {
        source: 'unsaved',
        displayName: 'Recorded checkout flow',
        topology: historicalScenario.topology,
        configuredTopology: historicalScenario.configuredTopology,
      },
    });
    expect(request.headers).not.toContainEqual({
      key: 'x-flow-id',
      value: 'old-generated-correlation-id',
    });
    expect(request.scenarioSnapshot?.scenarioId).toBeUndefined();
    expect(request.scenarioSnapshot?.sourcePath).toBeUndefined();
    expect(request.scenarioSnapshot?.sourceFilename).toBeUndefined();
  });
});
