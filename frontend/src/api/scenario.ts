import { LoadBundledScenario } from '../../wailsjs/go/main/App';
import type { api } from '../../wailsjs/go/models';

import { call } from './client';
import type { Result } from './result';

export function loadBundledScenario(): Promise<Result<api.ScenarioData>> {
  return call(async () => {
    const response = await LoadBundledScenario();
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
        message: 'The bundled scenario could not be loaded.',
        retryable: false,
      },
    };
  });
}
