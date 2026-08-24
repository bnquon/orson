import { useCallback, useEffect, useRef, useState } from 'react';
import { loadBundledScenario } from '../../api/scenario';
import type { ApiError } from '../../api/result';
import { toLoadedScenario } from './scenarioMapping';
import type { LoadedScenario } from './types';

type ScenarioLoadStatus = 'loading' | 'loaded' | 'loaded_with_warnings' | 'failed';

export interface ScenarioController {
  status: ScenarioLoadStatus;
  scenario: LoadedScenario | null;
  error: ApiError | null;
  retry(): Promise<void>;
}

export function useScenario(): ScenarioController {
  const [status, setStatus] = useState<ScenarioLoadStatus>('loading');
  const [scenario, setScenario] = useState<LoadedScenario | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const retry = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setError(null);

    const result = await loadBundledScenario();
    if (!mountedRef.current || requestIdRef.current !== requestId) return;

    if (!result.ok) {
      setScenario(null);
      setError(result.error);
      setStatus('failed');
      return;
    }

    const loaded = toLoadedScenario(result.data);
    setScenario(loaded);
    setStatus(loaded.warnings.length > 0 ? 'loaded_with_warnings' : 'loaded');
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void Promise.resolve().then(() => retry());

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [retry]);

  return { status, scenario, error, retry };
}
