import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { api } from '../../../wailsjs/go/models';
import { listLocalScenarios, loadBundledScenario, loadLocalScenario } from '../../api/scenario';
import type { ApiError } from '../../api/result';
import {
  initialLocalScenarioSessionState,
  localScenarioSessionReducer,
} from './localScenarioSession';
import { toLoadedScenario, toScenarioDescriptor, type ScenarioDraftData } from './scenarioMapping';
import { createUnsavedLoadedScenario, createUnsavedScenario } from './scenarioFactory';
import { useScenarioFolders } from './useScenarioFolders';
import { useScenarioFiles } from './useScenarioFiles';
import { invalidSelectionError, protocolError } from './scenarioErrors';
import type { WorkspaceRequestOutcome } from '../workspace/useWorkspace';
import type {
  LoadedScenario,
  ScenarioDescriptor,
  ScenarioDiagnostic,
  ScenarioFileFeedback,
  ScenarioFileOperationOutcome,
  ScenarioFolderFeedback,
  ScenarioFolder,
  ScenarioDraft,
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
  loadDraftAsUnsaved(draft: ScenarioDraft): void;
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

  const {
    localFolders,
    setLocalFolders,
    folderOperation,
    folderError,
    setFolderError,
    folderFeedback,
    setFolderFeedback,
    createFolder,
    renameFolder,
    moveFolder,
    reorderFolder,
    moveScenario,
    deleteFolder,
  } = useScenarioFolders({
    mountedRef,
    activeScenarioIdRef,
    localDescriptorsRef,
    selectedScenarioId,
    setSelectedScenarioId,
    setSelectedDiagnostics,
    setSelectedLoadStatus,
    setSelectedLoadError,
    replaceLocalDescriptors,
    clearScenarioSelection,
    onPersistence,
  });

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
    activateScenario(createUnsavedLoadedScenario(createUnsavedScenario()), null);
  }, [activateScenario, dispatchLocalSession, scenario]);

  const loadDraftAsUnsaved = useCallback(
    (draft: ScenarioDraft) => {
      if (scenario?.source !== 'unsaved') scenarioBeforeUnsavedRef.current = scenario;
      dispatchLocalSession({ type: 'feedback_cleared' });
      activateScenario(createUnsavedLoadedScenario(draft), null);
    },
    [activateScenario, dispatchLocalSession, scenario],
  );

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

  const { importScenario, saveScenario, saveActiveScenarioAs, removeScenario, clearFileFeedback } =
    useScenarioFiles({
      scenario,
      dispatchLocalSession,
      activateScenario,
      mountedRef,
      onPersistence,
      onRememberScenario,
      refreshLocalDescriptors,
      scenarioBeforeUnsavedRef,
      activeScenarioIdRef,
      clearScenarioSelection,
      bootstrapIdentityRef,
      onRetryBootstrap,
    });

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
    setLocalFolders,
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
    loadDraftAsUnsaved,
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
    clearFolderFeedback: () => setFolderFeedback({ successMessage: null }),
  };
}
