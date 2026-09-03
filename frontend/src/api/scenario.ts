import {
  ImportLocalScenario,
  ListLocalScenarios,
  LoadBundledScenario,
  LoadLocalScenario,
  PreviewScenarioYAML,
  RemoveLocalScenario,
  SaveLocalScenario,
  SaveScenarioAs,
} from '../../wailsjs/go/main/App';
import { api } from '../../wailsjs/go/models';
import type { ScenarioDraftData } from '../features/workbench/scenarioMapping';

import { call } from './client';
import type { ApiError, Result } from './result';

export type ScenarioFileResult =
  | { ok: true; data: api.ScenarioFileData }
  | {
      ok: false;
      error: ApiError;
      diagnostics: api.ScenarioDiagnostic[];
    };

export type ScenarioYamlPreviewResult =
  | {
      ok: true;
      data: {
        yaml: string;
        warnings: api.ScenarioWarning[];
      };
    }
  | {
      ok: false;
      error: ApiError;
      diagnostics: api.ScenarioDiagnostic[];
    };

async function fileCall(
  request: () => Promise<api.ScenarioFileResponse>,
): Promise<ScenarioFileResult> {
  try {
    const response = await request();
    if (response.ok && response.data !== undefined) {
      return { ok: true, data: response.data };
    }

    return {
      ok: false,
      error: response.error ?? {
        code: 'scenario_file_operation_failed',
        message: 'The scenario file operation could not be completed.',
        retryable: false,
      },
      diagnostics: response.data?.diagnostics ?? [],
    };
  } catch {
    return {
      ok: false,
      error: {
        code: 'bridge_error',
        message: 'The app could not communicate with the backend.',
        retryable: true,
      },
      diagnostics: [],
    };
  }
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

export function listLocalScenarios(): Promise<Result<api.ScenarioListData>> {
  return call(async () => {
    const response = await ListLocalScenarios();
    if (response.ok && response.data !== undefined) return { ok: true, data: response.data };

    return {
      ok: false,
      error: response.error ?? {
        code: 'local_scenario_list_failed',
        message: 'My scenarios could not be loaded for this session.',
        retryable: true,
      },
    };
  });
}

export function importLocalScenario(): Promise<ScenarioFileResult> {
  return fileCall(() => ImportLocalScenario());
}

export function loadLocalScenario(id: string): Promise<Result<api.ScenarioData>> {
  return call(async () => {
    const response = await LoadLocalScenario(id);
    if (response.ok && response.data !== undefined) return { ok: true, data: response.data };

    return {
      ok: false,
      error: response.error ?? {
        code: 'local_scenario_load_failed',
        message: 'The selected local scenario could not be loaded.',
        retryable: false,
      },
    };
  });
}

export function removeLocalScenario(id: string): Promise<ScenarioFileResult> {
  return fileCall(() => RemoveLocalScenario(id));
}

export function saveLocalScenario(
  id: string,
  draft: ScenarioDraftData,
): Promise<ScenarioFileResult> {
  return fileCall(() => SaveLocalScenario(id, new api.ScenarioDraft(draft)));
}

export function saveScenarioAs(draft: ScenarioDraftData): Promise<ScenarioFileResult> {
  return fileCall(() => SaveScenarioAs(new api.ScenarioDraft(draft)));
}

export async function previewScenarioYaml(
  draft: ScenarioDraftData,
  sourceFilename = '',
): Promise<ScenarioYamlPreviewResult> {
  try {
    const response = await PreviewScenarioYAML(new api.ScenarioDraft(draft), sourceFilename);
    if (response.ok && response.data?.yaml !== undefined) {
      return {
        ok: true,
        data: {
          yaml: response.data.yaml,
          warnings: response.data.warnings ?? [],
        },
      };
    }

    return {
      ok: false,
      error: response.error ?? {
        code: 'scenario_yaml_preview_failed',
        message: 'The current draft could not be converted to YAML.',
        retryable: false,
      },
      diagnostics: response.data?.diagnostics ?? [],
    };
  } catch {
    return {
      ok: false,
      error: {
        code: 'bridge_error',
        message: 'The app could not communicate with the backend.',
        retryable: true,
      },
      diagnostics: [],
    };
  }
}
