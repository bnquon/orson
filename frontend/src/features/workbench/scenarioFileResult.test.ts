import { describe, expect, it, vi } from 'vitest';
import { api } from '../../../wailsjs/go/models';
import { applyScenarioFileResult, resolveScenarioFileResult } from './scenarioFileResult';

function successfulResult(id: string, filename: string) {
  return {
    ok: true as const,
    data: new api.ScenarioFileData({
      cancelled: false,
      descriptor: {
        id,
        displayName: filename.replace('.yaml', ''),
        relativePath: filename,
        sourceFilename: filename,
        source: 'local',
        sourcePath: `/tmp/${filename}`,
        localStatus: 'available',
        status: 'valid',
      },
      scenario: {
        id,
        relativePath: filename,
        name: filename.replace('.yaml', ''),
        sourceFilename: filename,
        source: 'local',
        sourcePath: `/tmp/${filename}`,
        localStatus: 'available',
        publishTopic: 'orders',
        publishPayload: '{}',
        messageKey: '',
        headers: [],
        watchedTopics: ['payments'],
        correlationHeader: 'x-correlation-id',
        captureTimeoutSeconds: 10,
        topology: [],
        configuredTopology: [],
      },
    }),
  };
}

describe('resolveScenarioFileResult', () => {
  it('keeps failed imports non-activating while preserving structured diagnostics', () => {
    const resolved = resolveScenarioFileResult(
      {
        ok: false,
        error: {
          code: 'scenario_parse_failed',
          message: 'Could not parse YAML.',
          retryable: false,
        },
        diagnostics: [
          new api.ScenarioDiagnostic({
            code: 'yaml_parse_error',
            message: 'Unexpected token.',
            sourceFilename: 'broken.yaml',
            line: 4,
            column: 8,
          }),
        ],
      },
      'current.yaml',
    );

    expect(resolved.outcome).toBe('failed');
    expect('scenario' in resolved).toBe(false);
    if (resolved.outcome === 'failed') {
      expect(resolved.diagnostics[0]).toMatchObject({
        sourceFilename: 'broken.yaml',
        line: 4,
        column: 8,
      });
    }
  });

  it('returns the loaded scenario only after a successful import or Save as response', () => {
    const resolved = resolveScenarioFileResult(
      successfulResult('local:backend-id', 'copy.yaml'),
      'current.yaml',
    );

    expect(resolved.outcome).toBe('succeeded');
    if (resolved.outcome === 'succeeded') {
      expect(resolved.descriptor.id).toBe('local:backend-id');
      expect(resolved.scenario.id).toBe('local:backend-id');
      expect(resolved.scenario.sourcePath).toBe('/tmp/copy.yaml');
    }
  });

  it('treats native picker cancellation as a non-error with no scenario activation', () => {
    const resolved = resolveScenarioFileResult(
      { ok: true, data: new api.ScenarioFileData({ cancelled: true }) },
      'current.yaml',
    );

    expect(resolved).toEqual({ outcome: 'cancelled' });
  });

  it('dispatches and activates only after a successful backend result', () => {
    const dispatch = vi.fn();
    const activate = vi.fn();
    const result = successfulResult('local:backend-id', 'copy.yaml');

    expect(
      applyScenarioFileResult(result, 'current.yaml', (item) => `${item.sourceFilename} saved`, {
        dispatch,
        activate,
      }),
    ).toBe('succeeded');
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'operation_succeeded', message: 'copy.yaml saved' }),
    );
    expect(activate).toHaveBeenCalledWith(expect.objectContaining({ id: 'local:backend-id' }));

    dispatch.mockClear();
    activate.mockClear();
    expect(
      applyScenarioFileResult(
        {
          ok: false,
          error: { code: 'scenario_parse_failed', message: 'Invalid YAML.', retryable: false },
          diagnostics: [],
        },
        'broken.yaml',
        () => 'unused',
        { dispatch, activate },
      ),
    ).toBe('failed');
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'operation_failed' }));
    expect(activate).not.toHaveBeenCalled();
  });
});
