import { useCallback, useEffect, useRef, useState } from 'react';
import { listBundledScenarios, loadBundledScenario } from '../../api/scenario';
import type { ApiError } from '../../api/result';
import { toLoadedScenario, toScenarioDescriptor } from './scenarioMapping';
import type { LoadedScenario, ScenarioDescriptor, ScenarioDiagnostic } from './types';

type ScenarioCatalogStatus = 'loading' | 'loaded' | 'failed';
type ScenarioSelectionStatus = 'idle' | 'loading' | 'failed';

export interface ScenarioController {
  catalogStatus: ScenarioCatalogStatus;
  descriptors: ScenarioDescriptor[];
  selectedScenarioId: string | null;
  activeScenarioId: string | null;
  scenario: LoadedScenario | null;
  selectedDescriptor: ScenarioDescriptor | null;
  selectedDiagnostics: ScenarioDiagnostic[];
  selectedLoadStatus: ScenarioSelectionStatus;
  selectedLoadError: ApiError | null;
  error: ApiError | null;
  retry(): Promise<void>;
  retrySelectedScenario(): Promise<void>;
  selectScenario(id: string): Promise<void>;
}

function invalidSelectionError(descriptor: ScenarioDescriptor): ApiError {
  return {
    code: 'scenario_invalid',
    message: `${descriptor.sourceFilename} is invalid.`,
    details: descriptor.diagnostics.map((diagnostic) => diagnostic.message).join('\n'),
    retryable: false,
  };
}

export function useScenario(): ScenarioController {
  const [catalogStatus, setCatalogStatus] = useState<ScenarioCatalogStatus>('loading');
  const [descriptors, setDescriptors] = useState<ScenarioDescriptor[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<LoadedScenario | null>(null);
  const [selectedDiagnostics, setSelectedDiagnostics] = useState<ScenarioDiagnostic[]>([]);
  const [selectedLoadStatus, setSelectedLoadStatus] = useState<ScenarioSelectionStatus>('idle');
  const [selectedLoadError, setSelectedLoadError] = useState<ApiError | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const descriptorsRef = useRef<ScenarioDescriptor[]>([]);
  const activeScenarioIdRef = useRef<string | null>(null);

  const loadScenario = useCallback(
    async (id: string, descriptor: ScenarioDescriptor, requestId: number) => {
      setSelectedLoadStatus('loading');
      setSelectedDiagnostics([]);
      setSelectedLoadError(null);
      setError(null);

      const result = await loadBundledScenario(id);
      if (!mountedRef.current || requestIdRef.current !== requestId) return;

      setSelectedLoadStatus(result.ok ? 'idle' : 'failed');
      if (!result.ok) {
        setSelectedDiagnostics(descriptor.diagnostics);
        setSelectedLoadError(result.error);
        setError(result.error);
        return;
      }

      const loaded = toLoadedScenario(result.data);
      setScenario(loaded);
      setActiveScenarioId(loaded.id);
      activeScenarioIdRef.current = loaded.id;
      setSelectedDiagnostics([]);
      setSelectedLoadError(null);
      setError(null);
    },
    [],
  );

  const selectScenario = useCallback(
    async (id: string) => {
      const descriptor = descriptorsRef.current.find((item) => item.id === id);
      const requestId = ++requestIdRef.current;
      setSelectedScenarioId(id);
      setSelectedLoadError(null);
      setSelectedDiagnostics([]);
      setError(null);

      if (descriptor === undefined) {
        setSelectedLoadStatus('failed');
        setError({
          code: 'scenario_not_found',
          message: 'That bundled scenario was not found.',
          retryable: false,
        });
        setSelectedLoadError({
          code: 'scenario_not_found',
          message: 'That bundled scenario was not found.',
          retryable: false,
        });
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
    [loadScenario],
  );

  const retrySelectedScenario = useCallback(async () => {
    if (selectedScenarioId === null) return;

    const descriptor = descriptorsRef.current.find((item) => item.id === selectedScenarioId);
    if (descriptor === undefined || descriptor.status === 'invalid') return;

    const requestId = ++requestIdRef.current;
    await loadScenario(selectedScenarioId, descriptor, requestId);
  }, [loadScenario, selectedScenarioId]);

  const retry = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setCatalogStatus('loading');
    setError(null);
    setSelectedLoadError(null);

    const result = await listBundledScenarios();
    if (!mountedRef.current || requestIdRef.current !== requestId) return;

    if (!result.ok) {
      setCatalogStatus('failed');
      setError(result.error);
      return;
    }

    const nextDescriptors = result.data.scenarios.map(toScenarioDescriptor);
    descriptorsRef.current = nextDescriptors;
    setDescriptors(nextDescriptors);
    setCatalogStatus('loaded');

    const currentActive = nextDescriptors.find(
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
    const preferred = nextDescriptors.find(
      (descriptor) => descriptor.id === 'order-flow.yaml' && descriptor.status !== 'invalid',
    );
    const firstValid = nextDescriptors.find((descriptor) => descriptor.status !== 'invalid');
    const target = preferred ?? firstValid;

    if (target === undefined) {
      const firstDescriptor = nextDescriptors[0];
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
  }, [loadScenario]);

  useEffect(() => {
    mountedRef.current = true;
    void Promise.resolve().then(() => retry());

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [retry]);

  const selectedDescriptor =
    descriptors.find((descriptor) => descriptor.id === selectedScenarioId) ?? null;

  return {
    catalogStatus,
    descriptors,
    selectedScenarioId,
    activeScenarioId,
    scenario,
    selectedDescriptor,
    selectedDiagnostics,
    selectedLoadStatus,
    selectedLoadError,
    error,
    retry,
    retrySelectedScenario,
    selectScenario,
  };
}
