import { ListBundledScenarios, LoadBundledScenario } from '../../wailsjs/go/main/App';
import type { api } from '../../wailsjs/go/models';

import { call } from './client';
import type { Result } from './result';

export function listBundledScenarios(): Promise<Result<api.ScenarioListData>> {
  return call(async () => {
    const response = await ListBundledScenarios();
    if (response.ok && response.data !== undefined) {
      return {
        ok: true,
        data: response.data,
      };
    }

    return {
      ok: false,
      error: response.error ?? {
        code: 'scenario_catalog_failed',
        message: 'The bundled scenario catalog could not be loaded.',
        retryable: false,
      },
    };
  });
}

export function loadBundledScenario(id: string): Promise<Result<api.ScenarioData>> {
  return call(async () => {
    const response = await LoadBundledScenario(id);
    if (response.ok && response.data !== undefined) {
      return {
        ok: true,
        data: response.data,
      };
    }

    return {
      ok: false,
      error: response.error ?? {
        code: 'scenario_load_failed',
        message: 'The selected scenario could not be loaded.',
        retryable: false,
      },
    };
  });
}
