import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  importLocalScenario,
  listBundledScenarios,
  listLocalScenarios,
  loadBundledScenario,
  loadLocalScenario,
  saveLocalScenario,
  saveScenarioAs,
  type ScenarioFileResult,
} from '../../api/scenario';
import type { ApiError } from '../../api/result';
import {
  initialLocalScenarioSessionState,
  localScenarioSessionReducer,
} from './localScenarioSession';
import { toLoadedScenario, toScenarioDescriptor, type ScenarioDraftData } from './scenarioMapping';
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
  saveScenario(draft: ScenarioDraftData): Promise<ScenarioFileOperationOutcome>;
  saveScenarioAs(draft: ScenarioDraftData): Promise<ScenarioFileOperationOutcome>;
  clearFileFeedback(): void;
}

function invalidSelectionError(descriptor: ScenarioDescriptor): ApiError {
  return {
    code: 'scenario_invalid',
    message: `${descriptor.sourceFilename} is invalid.`,
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

export function useScenario(): ScenarioController {
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
    },
    [activateScenario, refreshLocalDescriptors],
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
        return;
      }

      if (descriptor.status === 'invalid') {
        setSelectedLoadStatus('failed');
        setSelectedDiagnostics(descriptor.diagnostics);
        const selectionError = invalidSelectionError(descriptor);
        setSelectedLoadError(selectionError);
        setError(selectionError);
        return;
      }

      await loadScenario(id, descriptor, requestId);
    },
    [allDescriptors, loadScenario],
  );

  const retrySelectedScenario = useCallback(async () => {
    if (selectedScenarioId === null) return;

    const descriptor = allDescriptors().find((item) => item.id === selectedScenarioId);
    if (descriptor === undefined || descriptor.status === 'invalid') return;

    const requestId = ++requestIdRef.current;
    await loadScenario(selectedScenarioId, descriptor, requestId);
  }, [allDescriptors, loadScenario, selectedScenarioId]);

  const retry = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setCatalogStatus('loading');
    setError(null);
    setSelectedLoadError(null);

    const [exampleResult, localResult] = await Promise.all([
      listBundledScenarios(),
      listLocalScenarios(),
    ]);
    if (!mountedRef.current || requestIdRef.current !== requestId) return;

    if (!exampleResult.ok) {
      setCatalogStatus('failed');
      setError(exampleResult.error);
      return;
    }

    const nextExamples = exampleResult.data.scenarios.map(toScenarioDescriptor);
    exampleDescriptorsRef.current = nextExamples;
    setExamples(nextExamples);
    setCatalogStatus('loaded');

    const nextLocals = localResult.ok ? localResult.data.scenarios.map(toScenarioDescriptor) : [];
    if (localResult.ok) {
      replaceLocalDescriptors(nextLocals);
    } else {
      dispatchLocalSession({ type: 'operation_failed', error: localResult.error });
    }

    const combined = [...nextExamples, ...nextLocals];
    const currentActive = combined.find(
      (descriptor) =>
        descriptor.id === activeScenarioIdRef.current && descriptor.status !== 'invalid',
    );
    if (currentActive !== undefined) {
      setSelectedScenarioId(currentActive.id);
      setSelectedDiagnostics([]);
      setSelectedLoadStatus('idle');
      setSelectedLoadError(null);
      return;
    }
    const preferred = nextExamples.find(
      (descriptor) => descriptor.id === 'order-flow.yaml' && descriptor.status !== 'invalid',
    );
    const firstValid = nextExamples.find((descriptor) => descriptor.status !== 'invalid');
    const target = preferred ?? firstValid;

    if (target === undefined) {
      const firstDescriptor = nextExamples[0];
      setSelectedScenarioId(firstDescriptor?.id ?? null);
      setSelectedDiagnostics(firstDescriptor?.diagnostics ?? []);
      setSelectedLoadStatus(firstDescriptor === undefined ? 'idle' : 'failed');
      setSelectedLoadError(
        firstDescriptor === undefined ? null : invalidSelectionError(firstDescriptor),
      );
      return;
    }

    setSelectedScenarioId(target.id);
    await loadScenario(target.id, target, requestId);
  }, [dispatchLocalSession, loadScenario, replaceLocalDescriptors]);

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
    if (!result.ok) await refreshLocalDescriptors();
    return handleFileResult(result, (descriptor) => `${descriptor.sourceFilename} imported`);
  }, [dispatchLocalSession, handleFileResult, refreshLocalDescriptors]);

  const saveScenario = useCallback(
    async (draft: ScenarioDraftData): Promise<ScenarioFileOperationOutcome> => {
      if (scenario === null || scenario.source !== 'local') return 'failed';
      dispatchLocalSession({ type: 'operation_started', operation: 'saving' });
      const result = await saveLocalScenario(scenario.id, draft);
      if (!mountedRef.current) return 'cancelled';
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
    [dispatchLocalSession, handleFileResult, refreshLocalDescriptors, scenario],
  );

  const saveActiveScenarioAs = useCallback(
    async (draft: ScenarioDraftData): Promise<ScenarioFileOperationOutcome> => {
      dispatchLocalSession({ type: 'operation_started', operation: 'saving_as' });
      const result = await saveScenarioAs(draft);
      if (!mountedRef.current) return 'cancelled';
      return handleFileResult(result, (descriptor) => `${descriptor.sourceFilename} saved`);
    },
    [dispatchLocalSession, handleFileResult],
  );

  const clearFileFeedback = useCallback(() => {
    dispatchLocalSession({ type: 'feedback_cleared' });
  }, [dispatchLocalSession]);

  useEffect(() => {
    mountedRef.current = true;
    void Promise.resolve().then(() => retry());

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [retry]);

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
    saveScenario,
    saveScenarioAs: saveActiveScenarioAs,
    clearFileFeedback,
  };
}
