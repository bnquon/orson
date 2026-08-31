import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { api } from '../../../wailsjs/go/models';
import {
  importLocalScenario,
  listLocalScenarios,
  loadBundledScenario,
  loadLocalScenario,
  removeLocalScenario,
  saveLocalScenario,
  saveScenarioAs,
  type ScenarioFileResult,
} from '../../api/scenario';
import {
  createScenarioFolder,
  deleteScenarioFolder,
  moveLocalScenario,
  moveScenarioFolder,
  reorderScenarioFolder,
  renameScenarioFolder,
} from '../../api/scenarioFolders';
import type { ApiError } from '../../api/result';
import {
  initialLocalScenarioSessionState,
  localScenarioSessionReducer,
} from './localScenarioSession';
import {
  toLoadedScenario,
  toScenarioDescriptor,
  toScenarioDiagnostic,
  type ScenarioDraftData,
} from './scenarioMapping';
import { createUnsavedScenario, createUnsavedScenarioId } from './scenarioFactory';
import { applyScenarioFileResult } from './scenarioFileResult';
import type { WorkspaceRequestOutcome } from '../workspace/useWorkspace';
import type {
  LoadedScenario,
  ScenarioDescriptor,
  ScenarioDiagnostic,
  ScenarioFileFeedback,
  ScenarioFileOperationOutcome,
  ScenarioFolderDeletionSummary,
  ScenarioFolderFeedback,
  ScenarioFolder,
} from './types';

type ScenarioCatalogStatus = 'loading' | 'loaded' | 'failed';
type ScenarioSelectionStatus = 'idle' | 'loading' | 'failed';
export type ScenarioFolderOperation = 'idle' | 'creating' | 'renaming' | 'moving' | 'deleting';
export interface ScenarioController {
  catalogStatus: ScenarioCatalogStatus;
  examples: ScenarioDescriptor[];
  localScenarios: ScenarioDescriptor[];
  localFolders: ScenarioFolder[];
  folderOperation: ScenarioFolderOperation;
  folderError: ApiError | null;
  folderFeedback: ScenarioFolderFeedback;
  activeScenarioCleared: boolean;
  descriptors: ScenarioDescriptor[];
  selectedScenarioId: string | null;
  activeScenarioId: string | null;
  scenario: LoadedScenario | null;
  selectedDescriptor: ScenarioDescriptor | null;
  selectedDiagnostics: ScenarioDiagnostic[];
  selectedLoadStatus: ScenarioSelectionStatus;
  selectedLoadError: ApiError | null;
  fileFeedback: ScenarioFileFeedback;
  error: ApiError | null;
  retry(): Promise<void>;
  retrySelectedScenario(): Promise<void>;
  selectScenario(id: string): Promise<void>;
  createScenario(): void;
  exitScenario(): void;
  importScenario(): Promise<ScenarioFileOperationOutcome>;
  removeScenario(id: string): Promise<ScenarioFileOperationOutcome>;
  saveScenario(draft: ScenarioDraftData): Promise<ScenarioFileOperationOutcome>;
  saveScenarioAs(draft: ScenarioDraftData): Promise<ScenarioFileOperationOutcome>;
  clearFileFeedback(): void;
  createFolder(name: string, parentId?: string): Promise<boolean>;
  renameFolder(id: string, name: string): Promise<boolean>;
  moveFolder(id: string, parentId: string): Promise<boolean>;
  reorderFolder(id: string, siblingIndex: number): Promise<boolean>;
  moveScenario(id: string, folderId: string, siblingIndex: number): Promise<boolean>;
  deleteFolder(id: string): Promise<boolean>;
  clearFolderError(): void;
  clearFolderFeedback(): void;
}

function invalidSelectionError(descriptor: ScenarioDescriptor): ApiError {
  const localMessages: Partial<Record<NonNullable<ScenarioDescriptor['localStatus']>, string>> = {
    changed: `${descriptor.sourceFilename} changed outside Orson. Re-import it to refresh this workspace.`,
    missing: `${descriptor.sourceFilename} is missing from disk.`,
    unreadable: `${descriptor.sourceFilename} could not be read.`,
  };
  return {
    code: descriptor.localStatus === 'available' ? 'scenario_invalid' : 'scenario_unavailable',
    message:
      (descriptor.localStatus === null ? undefined : localMessages[descriptor.localStatus]) ??
      `${descriptor.sourceFilename} is invalid.`,
    details: descriptor.diagnostics.map((diagnostic) => diagnostic.message).join('\n'),
    retryable: false,
  };
}

function protocolError(message: string): ApiError {
  return {
    code: 'scenario_file_response_invalid',
    message,
    retryable: true,
  };
}

function toFolderDeletionSummary(
  summary: api.FolderMutationSummary | undefined,
): ScenarioFolderDeletionSummary | null {
  if (summary === undefined) return null;
  return {
    removedScenarioCount: summary.removedScenarioCount ?? 0,
  };
}

function folderDeletionMessage(summary: ScenarioFolderDeletionSummary | null): string {
  if (summary === null) return 'Folder deleted';

  const scenarioLabel = summary.removedScenarioCount === 1 ? 'scenario' : 'scenarios';
  return `Folder deleted. ${summary.removedScenarioCount} ${scenarioLabel} removed.`;
}

interface UseScenarioOptions {
  bootstrap: api.WorkspaceBootstrapData | null;
  bootstrapError: ApiError | null;
  onRetryBootstrap: () => Promise<WorkspaceRequestOutcome>;
  onRememberScenario: (source: 'example' | 'local', scenarioId: string) => Promise<void>;
  onPersistence: (status: api.WorkspacePersistenceStatus | undefined) => void;
}

export function useScenario({
  bootstrap,
  bootstrapError,
  onRetryBootstrap,
  onRememberScenario,
  onPersistence,
}: UseScenarioOptions): ScenarioController {
  const [catalogStatus, setCatalogStatus] = useState<ScenarioCatalogStatus>('loading');
  const [examples, setExamples] = useState<ScenarioDescriptor[]>([]);
  const [localSession, dispatchLocalSession] = useReducer(
    localScenarioSessionReducer,
    initialLocalScenarioSessionState,
  );
  // Backend-issued IDs and source metadata remain authoritative. This ref only exposes the
  // latest mirrored descriptors to stable async callbacks; it never derives file identity.
  const localDescriptorsRef = useRef(localSession.descriptors);
  useEffect(() => {
    localDescriptorsRef.current = localSession.descriptors;
  }, [localSession.descriptors]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<LoadedScenario | null>(null);
  const [selectedDiagnostics, setSelectedDiagnostics] = useState<ScenarioDiagnostic[]>([]);
  const [selectedLoadStatus, setSelectedLoadStatus] = useState<ScenarioSelectionStatus>('idle');
  const [selectedLoadError, setSelectedLoadError] = useState<ApiError | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [localFolders, setLocalFolders] = useState<ScenarioFolder[]>([]);
  const [folderOperation, setFolderOperation] = useState<ScenarioFolderOperation>('idle');
  const [folderError, setFolderError] = useState<ApiError | null>(null);
  const [folderFeedback, setFolderFeedback] = useState<ScenarioFolderFeedback>({
    successMessage: null,
    deletionSummary: null,
  });
  const [activeScenarioCleared, setActiveScenarioCleared] = useState(false);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const exampleDescriptorsRef = useRef<ScenarioDescriptor[]>([]);
  const activeScenarioIdRef = useRef<string | null>(null);
  const scenarioBeforeUnsavedRef = useRef<LoadedScenario | null>(null);
  const exitInFlightRef = useRef(false);
  const bootstrapIdentityRef = useRef('');
  const bootstrapIdentity =
    bootstrap === null
      ? ''
      : [
          bootstrap.activeWorkspace.id,
          bootstrap.selectedScenarioId,
          bootstrap.selectedScenario?.id ?? '',
          ...bootstrap.localScenarios.map((descriptor) => descriptor.id),
          ...bootstrap.localScenarios.map(
            (descriptor) =>
              `${descriptor.id}:${descriptor.folderId ?? ''}:${descriptor.siblingOrder ?? 0}`,
          ),
          ...(bootstrap.localFolders ?? []).map(
            (folder) => `${folder.id}:${folder.parentId ?? ''}:${folder.siblingOrder}`,
          ),
        ].join('|');

  const allDescriptors = useCallback(
    () => [...exampleDescriptorsRef.current, ...localDescriptorsRef.current],
    [],
  );

  const replaceLocalDescriptors = useCallback(
    (descriptors: ScenarioDescriptor[]) => {
      dispatchLocalSession({ type: 'listed', descriptors });
    },
    [dispatchLocalSession],
  );

  const refreshLocalDescriptors = useCallback(async () => {
    const result = await listLocalScenarios();
    if (!mountedRef.current || !result.ok) return null;
    const descriptors = result.data.scenarios.map(toScenarioDescriptor);
    replaceLocalDescriptors(descriptors);
    return descriptors;
  }, [replaceLocalDescriptors]);

  const applyFolderData = useCallback(
    (data: api.ScenarioFolderData) => {
      setLocalFolders(
        (data.folders ?? []).map((folder) => ({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId ?? '',
          siblingOrder: folder.siblingOrder ?? 0,
        })),
      );
      replaceLocalDescriptors((data.scenarios ?? []).map(toScenarioDescriptor));
    },
    [replaceLocalDescriptors],
  );

  const clearScenarioSelection = useCallback((showBlankWorkbench: boolean) => {
    requestIdRef.current += 1;
    setScenario(null);
    setActiveScenarioId(null);
    activeScenarioIdRef.current = null;
    setSelectedScenarioId(null);
    setSelectedDiagnostics([]);
    setSelectedLoadStatus('idle');
    setSelectedLoadError(null);
    setActiveScenarioCleared(showBlankWorkbench);
  }, []);

  const runFolderOperation = useCallback(
    async (
      operation: Exclude<ScenarioFolderOperation, 'idle'>,
      request: () => ReturnType<typeof createScenarioFolder>,
    ) => {
      setFolderOperation(operation);
      setFolderError(null);
      setFolderFeedback({ successMessage: null, deletionSummary: null });
      const activeIdBeforeOperation = activeScenarioIdRef.current;
      const activeWasLocal =
        activeIdBeforeOperation !== null &&
        localDescriptorsRef.current.some((item) => item.id === activeIdBeforeOperation);
      const selectedIdBeforeOperation = selectedScenarioId;
      const selectedWasLocal =
        selectedIdBeforeOperation !== null &&
        localDescriptorsRef.current.some((item) => item.id === selectedIdBeforeOperation);
      const result = await request();
      if (!mountedRef.current) return false;
      if (result.data !== undefined) applyFolderData(result.data);
      if (result.data?.persistence !== undefined) onPersistence(result.data.persistence);
      const deletionSummary =
        operation === 'deleting' ? toFolderDeletionSummary(result.data?.summary) : null;
      if (operation === 'deleting' && result.data !== undefined) {
        const remainingScenarioIds = new Set(result.data.scenarios.map((item) => item.id));
        const activeWasRemoved =
          activeWasLocal &&
          activeIdBeforeOperation !== null &&
          !remainingScenarioIds.has(activeIdBeforeOperation);
        const selectedWasRemoved =
          selectedWasLocal &&
          selectedIdBeforeOperation !== null &&
          !remainingScenarioIds.has(selectedIdBeforeOperation);

        if (activeWasRemoved) {
          clearScenarioSelection(true);
        } else if (selectedWasRemoved) {
          setSelectedScenarioId(null);
          setSelectedDiagnostics([]);
          setSelectedLoadStatus('idle');
          setSelectedLoadError(null);
        }
        if (result.ok) {
          setFolderFeedback({
            successMessage: folderDeletionMessage(deletionSummary),
            deletionSummary,
          });
        }
      }
      if (!result.ok) {
        setFolderError(result.error);
        setFolderOperation('idle');
        return false;
      }
      setFolderError(null);
      setFolderOperation('idle');
      return true;
    },
    [applyFolderData, clearScenarioSelection, onPersistence, selectedScenarioId],
  );

  const createFolder = useCallback(
    (name: string, parentId = '') =>
      runFolderOperation('creating', () => createScenarioFolder(name, parentId)),
    [runFolderOperation],
  );
  const renameFolder = useCallback(
    (id: string, name: string) =>
      runFolderOperation('renaming', () => renameScenarioFolder(id, name)),
    [runFolderOperation],
  );
  const moveFolder = useCallback(
    (id: string, parentId: string) =>
      runFolderOperation('moving', () => moveScenarioFolder(id, parentId)),
    [runFolderOperation],
  );
  const reorderFolder = useCallback(
    (id: string, siblingIndex: number) =>
      runFolderOperation('moving', () => reorderScenarioFolder(id, siblingIndex)),
    [runFolderOperation],
  );
  const moveScenario = useCallback(
    (id: string, folderId: string, siblingIndex: number) =>
      runFolderOperation('moving', () => moveLocalScenario(id, folderId, siblingIndex)),
    [runFolderOperation],
  );
  const deleteFolder = useCallback(
    (id: string) => runFolderOperation('deleting', () => deleteScenarioFolder(id)),
    [runFolderOperation],
  );

  const activateScenario = useCallback(
    (loaded: LoadedScenario, selectedId: string | null = loaded.id) => {
      requestIdRef.current += 1;
      setScenario(loaded);
      setActiveScenarioCleared(false);
      setActiveScenarioId(loaded.id);
      activeScenarioIdRef.current = loaded.id;
      setSelectedScenarioId(selectedId);
      setSelectedDiagnostics([]);
      setSelectedLoadStatus('idle');
      setSelectedLoadError(null);
      setError(null);
    },
    [],
  );

  const createScenario = useCallback(() => {
    if (scenario?.source !== 'unsaved') scenarioBeforeUnsavedRef.current = scenario;
    dispatchLocalSession({ type: 'feedback_cleared' });
    const draft = createUnsavedScenario();
    const unsaved: LoadedScenario = {
      id: createUnsavedScenarioId(),
      relativePath: '',
      folderPath: '',
      name: draft.name,
      sourceFilename: '',
      source: 'unsaved',
      sourcePath: '',
      localStatus: null,
      draft,
      warnings: [],
    };
    activateScenario(unsaved, null);
  }, [activateScenario, dispatchLocalSession, scenario]);

  const exitScenario = useCallback(() => {
    if (scenario?.source !== 'unsaved') return;
    if (exitInFlightRef.current) return;

    const previousScenario = scenarioBeforeUnsavedRef.current;
    scenarioBeforeUnsavedRef.current = null;
    if (previousScenario !== null) {
      activateScenario(previousScenario);
      return;
    }

    setCatalogStatus('loading');
    setError(null);
    setSelectedLoadError(null);
    dispatchLocalSession({ type: 'feedback_cleared' });
    bootstrapIdentityRef.current = '';
    exitInFlightRef.current = true;
    const reportRefreshFailure = () => {
      exitInFlightRef.current = false;
      if (!mountedRef.current) return;
      const refreshError = protocolError(
        'Scenario exited, but the workspace could not be refreshed.',
      );
      setCatalogStatus('failed');
      setError(refreshError);
      dispatchLocalSession({ type: 'operation_failed', error: refreshError });
    };
    void onRetryBootstrap().then((outcome) => {
      exitInFlightRef.current = false;
      if (outcome === 'failed') reportRefreshFailure();
    }, reportRefreshFailure);
  }, [activateScenario, dispatchLocalSession, onRetryBootstrap, scenario]);

  const loadScenario = useCallback(
    async (id: string, descriptor: ScenarioDescriptor, requestId: number) => {
      setSelectedLoadStatus('loading');
      setSelectedDiagnostics([]);
      setSelectedLoadError(null);
      setError(null);

      const result =
        descriptor.source === 'local' ? await loadLocalScenario(id) : await loadBundledScenario(id);
      if (!mountedRef.current || requestIdRef.current !== requestId) return;

      setSelectedLoadStatus(result.ok ? 'idle' : 'failed');
      if (!result.ok) {
        const refreshed = descriptor.source === 'local' ? await refreshLocalDescriptors() : null;
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        const latest = refreshed?.find((item) => item.id === descriptor.id);
        setSelectedDiagnostics(latest?.diagnostics ?? descriptor.diagnostics);
        setSelectedLoadError(result.error);
        setError(result.error);
        return;
      }

      activateScenario(toLoadedScenario(result.data));
      if (descriptor.source !== 'unsaved') void onRememberScenario(descriptor.source, id);
    },
    [activateScenario, onRememberScenario, refreshLocalDescriptors],
  );

  const selectScenario = useCallback(
    async (id: string) => {
      const descriptor = allDescriptors().find((item) => item.id === id);
      const requestId = ++requestIdRef.current;
      setSelectedScenarioId(id);
      setSelectedLoadError(null);
      setSelectedDiagnostics([]);
      setError(null);

      if (descriptor === undefined) {
        const missingError = protocolError('That scenario is no longer available in this session.');
        setSelectedLoadStatus('failed');
        setError(missingError);
        setSelectedLoadError(missingError);
        return;
      }

      if (id === activeScenarioIdRef.current) {
        setSelectedLoadStatus('idle');
        setSelectedDiagnostics([]);
        if (descriptor.source !== 'unsaved') void onRememberScenario(descriptor.source, id);
        return;
      }

      if (descriptor.status === 'invalid') {
        setSelectedLoadStatus('failed');
        setSelectedDiagnostics(descriptor.diagnostics);
        const selectionError = invalidSelectionError(descriptor);
        setSelectedLoadError(selectionError);
        setError(selectionError);
        if (descriptor.source !== 'unsaved') void onRememberScenario(descriptor.source, id);
        return;
      }

      await loadScenario(id, descriptor, requestId);
    },
    [allDescriptors, loadScenario, onRememberScenario],
  );

  const retrySelectedScenario = useCallback(async () => {
    if (selectedScenarioId === null) return;

    const descriptor = allDescriptors().find((item) => item.id === selectedScenarioId);
    if (descriptor === undefined || descriptor.status === 'invalid') return;

    const requestId = ++requestIdRef.current;
    await loadScenario(selectedScenarioId, descriptor, requestId);
  }, [allDescriptors, loadScenario, selectedScenarioId]);

  const retry = useCallback(async () => {
    setCatalogStatus('loading');
    setError(null);
    setSelectedLoadError(null);
    bootstrapIdentityRef.current = '';
    const refreshed = await onRetryBootstrap();
    if (refreshed !== 'failed') return;

    setCatalogStatus('failed');
    setError(bootstrapError ?? protocolError('The workspace could not be refreshed.'));
  }, [bootstrapError, onRetryBootstrap]);

  const handleFileResult = useCallback(
    (
      result: ScenarioFileResult,
      successMessage: (descriptor: ScenarioDescriptor) => string,
    ): ScenarioFileOperationOutcome =>
      applyScenarioFileResult(result, scenario?.sourceFilename ?? 'scenario.yaml', successMessage, {
        dispatch: dispatchLocalSession,
        activate: activateScenario,
      }),
    [activateScenario, dispatchLocalSession, scenario?.sourceFilename],
  );

  const importScenario = useCallback(async (): Promise<ScenarioFileOperationOutcome> => {
    dispatchLocalSession({ type: 'operation_started', operation: 'importing' });
    const result = await importLocalScenario();
    if (!mountedRef.current) return 'cancelled';
    if (result.ok) onPersistence(result.data.persistence);
    if (!result.ok) await refreshLocalDescriptors();
    const outcome = handleFileResult(
      result,
      (descriptor) => `${descriptor.sourceFilename} imported`,
    );
    if (result.ok && result.data.descriptor !== undefined) {
      void onRememberScenario('local', result.data.descriptor.id);
    }
    return outcome;
  }, [
    dispatchLocalSession,
    handleFileResult,
    onPersistence,
    onRememberScenario,
    refreshLocalDescriptors,
  ]);

  const saveScenario = useCallback(
    async (draft: ScenarioDraftData): Promise<ScenarioFileOperationOutcome> => {
      if (scenario === null || scenario.source !== 'local') return 'failed';
      dispatchLocalSession({ type: 'operation_started', operation: 'saving' });
      const result = await saveLocalScenario(scenario.id, draft);
      if (!mountedRef.current) return 'cancelled';
      if (result.ok) onPersistence(result.data.persistence);
      if (
        !result.ok &&
        ['scenario_file_changed', 'scenario_file_missing', 'scenario_read_failed'].includes(
          result.error.code,
        )
      ) {
        await refreshLocalDescriptors();
      }
      return handleFileResult(result, (descriptor) => `${descriptor.sourceFilename} saved`);
    },
    [dispatchLocalSession, handleFileResult, onPersistence, refreshLocalDescriptors, scenario],
  );

  const saveActiveScenarioAs = useCallback(
    async (draft: ScenarioDraftData): Promise<ScenarioFileOperationOutcome> => {
      dispatchLocalSession({ type: 'operation_started', operation: 'saving_as' });
      const result = await saveScenarioAs(draft);
      if (!mountedRef.current) return 'cancelled';
      if (result.ok) onPersistence(result.data.persistence);
      const outcome = handleFileResult(
        result,
        (descriptor) => `${descriptor.sourceFilename} saved`,
      );
      if (result.ok && result.data.descriptor !== undefined) {
        void onRememberScenario('local', result.data.descriptor.id);
      }
      return outcome;
    },
    [dispatchLocalSession, handleFileResult, onPersistence, onRememberScenario],
  );

  const removeScenario = useCallback(
    async (id: string): Promise<ScenarioFileOperationOutcome> => {
      if (scenario?.source === 'unsaved') {
        dispatchLocalSession({
          type: 'operation_failed',
          error: protocolError(
            'Save or exit the unsaved scenario before removing another scenario.',
          ),
        });
        return 'failed';
      }
      dispatchLocalSession({ type: 'operation_started', operation: 'removing' });
      const result = await removeLocalScenario(id);
      if (!mountedRef.current) return 'cancelled';
      if (!result.ok) {
        dispatchLocalSession({
          type: 'operation_failed',
          error: result.error,
          diagnostics: result.diagnostics.map((diagnostic) =>
            toScenarioDiagnostic(diagnostic, scenario?.sourceFilename ?? id),
          ),
        });
        return 'failed';
      }
      onPersistence(result.data.persistence);
      if (scenarioBeforeUnsavedRef.current?.id === id) {
        scenarioBeforeUnsavedRef.current = null;
      }
      dispatchLocalSession({ type: 'removed', id });
      if (activeScenarioIdRef.current === id) {
        clearScenarioSelection(false);
      }
      bootstrapIdentityRef.current = '';
      const refreshed = await onRetryBootstrap();
      if (!mountedRef.current) return 'cancelled';
      if (refreshed === 'failed') {
        dispatchLocalSession({
          type: 'operation_failed',
          error: protocolError('Scenario removed, but the workspace could not be refreshed.'),
        });
        return 'failed';
      }
      if (refreshed === 'superseded') {
        dispatchLocalSession({ type: 'operation_cancelled' });
        return 'cancelled';
      }
      dispatchLocalSession({ type: 'operation_succeeded', message: 'Scenario import removed' });
      return 'succeeded';
    },
    [
      clearScenarioSelection,
      dispatchLocalSession,
      onPersistence,
      onRetryBootstrap,
      scenario?.source,
      scenario?.sourceFilename,
    ],
  );

  const clearFileFeedback = useCallback(() => {
    dispatchLocalSession({ type: 'feedback_cleared' });
  }, [dispatchLocalSession]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useLayoutEffect(() => {
    requestIdRef.current += 1;
  }, [bootstrapIdentity]);

  useEffect(() => {
    if (!mountedRef.current) return;

    void Promise.resolve().then(() => {
      if (!mountedRef.current) return;
      if (bootstrap === null) {
        bootstrapIdentityRef.current = '';
        setCatalogStatus(bootstrapError === null ? 'loading' : 'failed');
        setError(bootstrapError);
        return;
      }

      if (bootstrapIdentityRef.current === bootstrapIdentity) return;
      bootstrapIdentityRef.current = bootstrapIdentity;

      const nextExamples = bootstrap.bundledScenarios.map(toScenarioDescriptor);
      const nextLocals = bootstrap.localScenarios.map(toScenarioDescriptor);
      const nextFolders = (bootstrap.localFolders ?? []).map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId ?? '',
        siblingOrder: folder.siblingOrder ?? 0,
      }));
      exampleDescriptorsRef.current = nextExamples;
      localDescriptorsRef.current = nextLocals;
      setExamples(nextExamples);
      setLocalFolders(nextFolders);
      replaceLocalDescriptors(nextLocals);
      setCatalogStatus('loaded');
      setError(null);
      setSelectedScenarioId(bootstrap.selectedScenarioId || null);
      setSelectedDiagnostics([]);
      setSelectedLoadStatus('idle');
      setSelectedLoadError(null);

      if (bootstrap.selectedScenario === undefined) {
        clearScenarioSelection(false);
        const selected = [...nextExamples, ...nextLocals].find(
          (descriptor) => descriptor.id === bootstrap.selectedScenarioId,
        );
        if (selected !== undefined) {
          const selectionError = invalidSelectionError(selected);
          setSelectedDiagnostics(selected.diagnostics);
          setSelectedLoadStatus('failed');
          setSelectedLoadError(selectionError);
          setError(selectionError);
        }
        return;
      }

      const loaded = toLoadedScenario(bootstrap.selectedScenario);
      setScenario(loaded);
      setActiveScenarioCleared(false);
      setActiveScenarioId(loaded.id);
      activeScenarioIdRef.current = loaded.id;
      if (bootstrap.selectedScenarioId && bootstrap.selectedScenarioId !== loaded.id) {
        const selected = nextLocals.find(
          (descriptor) => descriptor.id === bootstrap.selectedScenarioId,
        );
        if (selected !== undefined) {
          const selectionError = invalidSelectionError(selected);
          setSelectedDiagnostics(selected.diagnostics);
          setSelectedLoadStatus('failed');
          setSelectedLoadError(selectionError);
        }
      }
    });
  }, [
    bootstrap,
    bootstrapError,
    bootstrapIdentity,
    clearScenarioSelection,
    replaceLocalDescriptors,
  ]);

  const descriptors = [...examples, ...localSession.descriptors];
  const selectedDescriptor =
    descriptors.find((descriptor) => descriptor.id === selectedScenarioId) ?? null;

  return {
    catalogStatus,
    examples,
    localScenarios: localSession.descriptors,
    localFolders,
    folderOperation,
    folderError,
    descriptors,
    selectedScenarioId,
    activeScenarioId,
    scenario,
    selectedDescriptor,
    selectedDiagnostics,
    selectedLoadStatus,
    selectedLoadError,
    fileFeedback: {
      operation: localSession.operation,
      error: localSession.error,
      errorOperation: localSession.errorOperation,
      diagnostics: localSession.diagnostics,
      successMessage: localSession.successMessage,
    },
    error,
    retry,
    retrySelectedScenario,
    selectScenario,
    createScenario,
    exitScenario,
    importScenario,
    removeScenario,
    saveScenario,
    saveScenarioAs: saveActiveScenarioAs,
    clearFileFeedback,
    folderFeedback,
    activeScenarioCleared,
    createFolder,
    renameFolder,
    moveFolder,
    reorderFolder,
    moveScenario,
    deleteFolder,
    clearFolderError: () => setFolderError(null),
    clearFolderFeedback: () => setFolderFeedback({ successMessage: null, deletionSummary: null }),
  };
}
