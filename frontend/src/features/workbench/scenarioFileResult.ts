import type { ScenarioFileResult } from '../../api/scenario';
import type { ApiError } from '../../api/result';
import type { LocalScenarioSessionAction } from './localScenarioSession';
import { toLoadedScenario, toScenarioDescriptor, toScenarioDiagnostic } from './scenarioMapping';
import type {
  LoadedScenario,
  ScenarioDescriptor,
  ScenarioDiagnostic,
  ScenarioFileOperationOutcome,
} from './types';

export type ResolvedScenarioFileResult =
  | { outcome: 'cancelled' }
  | {
      outcome: 'failed';
      error: ApiError;
      diagnostics: ScenarioDiagnostic[];
    }
  | {
      outcome: 'succeeded';
      descriptor: ScenarioDescriptor;
      scenario: LoadedScenario;
    };

function protocolError(message: string): ApiError {
  return {
    code: 'scenario_file_response_invalid',
    message,
    retryable: true,
  };
}

export function resolveScenarioFileResult(
  result: ScenarioFileResult,
  fallbackFilename: string,
): ResolvedScenarioFileResult {
  if (!result.ok) {
    return {
      outcome: 'failed',
      error: result.error,
      diagnostics: result.diagnostics.map((diagnostic) =>
        toScenarioDiagnostic(diagnostic, fallbackFilename),
      ),
    };
  }
  if (result.data.cancelled) return { outcome: 'cancelled' };
  if (result.data.descriptor === undefined || result.data.scenario === undefined) {
    return {
      outcome: 'failed',
      error: protocolError('Orson did not receive the saved scenario details.'),
      diagnostics: [],
    };
  }

  return {
    outcome: 'succeeded',
    descriptor: toScenarioDescriptor(result.data.descriptor),
    scenario: toLoadedScenario(result.data.scenario),
  };
}

export function applyScenarioFileResult(
  result: ScenarioFileResult,
  fallbackFilename: string,
  successMessage: (descriptor: ScenarioDescriptor) => string,
  handlers: {
    dispatch(action: LocalScenarioSessionAction): void;
    activate(scenario: LoadedScenario): void;
  },
): ScenarioFileOperationOutcome {
  const resolved = resolveScenarioFileResult(result, fallbackFilename);
  if (resolved.outcome === 'failed') {
    handlers.dispatch({
      type: 'operation_failed',
      error: resolved.error,
      diagnostics: resolved.diagnostics,
    });
    return 'failed';
  }
  if (resolved.outcome === 'cancelled') {
    handlers.dispatch({ type: 'operation_cancelled' });
    return 'cancelled';
  }

  handlers.dispatch({
    type: 'operation_succeeded',
    descriptor: resolved.descriptor,
    message: successMessage(resolved.descriptor),
  });
  handlers.activate(resolved.scenario);
  return 'succeeded';
}
