import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
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
import { applyScenarioFileResult } from './scenarioFileResult';
import type {
  LoadedScenario,
  ScenarioDescriptor,
  ScenarioDiagnostic,
  ScenarioFileFeedback,
  ScenarioFileOperationOutcome,
} from './types';

type ScenarioCatalogStatus = 'loading' | 'loaded' | 'failed';
type ScenarioSelectionStatus = 'idle' | 'loading' | 'failed';
export interface ScenarioController {
  catalogStatus: ScenarioCatalogStatus;
  examples: ScenarioDescriptor[];
  localScenarios: ScenarioDescriptor[];
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
  importScenario(): Promise<ScenarioFileOperationOutcome>;
  removeScenario(id: string): Promise<ScenarioFileOperationOutcome>;
  saveScenario(draft: ScenarioDraftData): Promise<ScenarioFileOperationOutcome>;
  saveScenarioAs(draft: ScenarioDraftData): Promise<ScenarioFileOperationOutcome>;
  clearFileFeedback(): void;
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

interface UseScenarioOptions {
  bootstrap: api.WorkspaceBootstrapData | null;
  bootstrapError: ApiError | null;
  onRetryBootstrap: () => Promise<void>;
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
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const exampleDescriptorsRef = useRef<ScenarioDescriptor[]>([]);
  const activeScenarioIdRef = useRef<string | null>(null);
  const bootstrapIdentityRef = useRef('');

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

  const activateScenario = useCallback((loaded: LoadedScenario) => {
    requestIdRef.current += 1;
    setScenario(loaded);
    setActiveScenarioId(loaded.id);
    activeScenarioIdRef.current = loaded.id;
    setSelectedScenarioId(loaded.id);
    setSelectedDiagnostics([]);
    setSelectedLoadStatus('idle');
    setSelectedLoadError(null);
    setError(null);
  }, []);

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
      void onRememberScenario(descriptor.source, id);
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
        void onRememberScenario(descriptor.source, id);
        return;
      }

      if (descriptor.status === 'invalid') {
        setSelectedLoadStatus('failed');
        setSelectedDiagnostics(descriptor.diagnostics);
        const selectionError = invalidSelectionError(descriptor);
        setSelectedLoadError(selectionError);
        setError(selectionError);
        void onRememberScenario(descriptor.source, id);
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
    await onRetryBootstrap();
  }, [onRetryBootstrap]);

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
      dispatchLocalSession({ type: 'operation_succeeded', message: 'Scenario import removed' });
      await onRetryBootstrap();
      return 'succeeded';
    },
    [dispatchLocalSession, onPersistence, onRetryBootstrap, scenario?.sourceFilename],
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

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (!mountedRef.current) return;
      requestIdRef.current += 1;
      if (bootstrap === null) {
        bootstrapIdentityRef.current = '';
        setCatalogStatus(bootstrapError === null ? 'loading' : 'failed');
        setError(bootstrapError);
        return;
      }

      const bootstrapIdentity = [
        bootstrap.activeWorkspace.id,
        bootstrap.selectedScenarioId,
        bootstrap.selectedScenario?.id ?? '',
        ...bootstrap.localScenarios.map((descriptor) => descriptor.id),
      ].join('|');
      if (bootstrapIdentityRef.current === bootstrapIdentity) return;
      bootstrapIdentityRef.current = bootstrapIdentity;

      const nextExamples = bootstrap.bundledScenarios.map(toScenarioDescriptor);
      const nextLocals = bootstrap.localScenarios.map(toScenarioDescriptor);
      exampleDescriptorsRef.current = nextExamples;
      localDescriptorsRef.current = nextLocals;
      setExamples(nextExamples);
      replaceLocalDescriptors(nextLocals);
      setCatalogStatus('loaded');
      setError(null);
      setSelectedScenarioId(bootstrap.selectedScenarioId || null);
      setSelectedDiagnostics([]);
      setSelectedLoadStatus('idle');
      setSelectedLoadError(null);

      if (bootstrap.selectedScenario === undefined) {
        setScenario(null);
        setActiveScenarioId(null);
        activeScenarioIdRef.current = null;
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
  }, [bootstrap, bootstrapError, replaceLocalDescriptors]);

  const descriptors = [...examples, ...localSession.descriptors];
  const selectedDescriptor =
    descriptors.find((descriptor) => descriptor.id === selectedScenarioId) ?? null;

  return {
    catalogStatus,
    examples,
    localScenarios: localSession.descriptors,
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
    importScenario,
    removeScenario,
    saveScenario,
    saveScenarioAs: saveActiveScenarioAs,
    clearFileFeedback,
  };
}
