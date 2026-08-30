import { describe, expect, it } from 'vitest';
import {
  initialLocalScenarioSessionState,
  localScenarioSessionReducer,
} from '../localScenarioSession';
import type { ScenarioDescriptor } from '../types';

function localDescriptor(id: string, filename: string): ScenarioDescriptor {
  return {
    id,
    displayName: filename.replace(/\.ya?ml$/, ''),
    relativePath: filename,
    folderPath: '',
    sourceFilename: filename,
    source: 'local',
    sourcePath: `/tmp/${filename}`,
    localStatus: 'available',
    status: 'valid',
    warnings: [],
    diagnostics: [],
  };
}

describe('localScenarioSessionReducer', () => {
  it('mirrors the backend list without inventing frontend identities', () => {
    const descriptors = [localDescriptor('local:opaque-1', 'order.yaml')];
    const state = localScenarioSessionReducer(initialLocalScenarioSessionState, {
      type: 'listed',
      descriptors,
    });

    expect(state.descriptors).toEqual(descriptors);
    expect(state.descriptors[0]?.id).toBe('local:opaque-1');
  });

  it('refreshes a duplicate import by backend ID without adding another row', () => {
    const original = localDescriptor('local:opaque-1', 'order.yaml');
    const warning = {
      ...original,
      status: 'valid_with_warnings' as const,
      warnings: [
        {
          code: 'disconnected_topic',
          message: 'Topic is disconnected.',
          sourceFilename: 'order.yaml',
          line: 4,
          column: 3,
        },
      ],
    };
    const listed = localScenarioSessionReducer(initialLocalScenarioSessionState, {
      type: 'listed',
      descriptors: [original],
    });
    const refreshed = localScenarioSessionReducer(listed, {
      type: 'operation_succeeded',
      descriptor: warning,
    });

    expect(refreshed.descriptors).toEqual([warning]);
  });

  it('removes an imported descriptor immediately after backend removal succeeds', () => {
    const first = localDescriptor('local:opaque-1', 'first.yaml');
    const second = localDescriptor('local:opaque-2', 'second.yaml');
    const listed = localScenarioSessionReducer(initialLocalScenarioSessionState, {
      type: 'listed',
      descriptors: [first, second],
    });
    const removing = localScenarioSessionReducer(listed, {
      type: 'operation_started',
      operation: 'removing',
    });

    const removed = localScenarioSessionReducer(removing, {
      type: 'removed',
      id: first.id,
    });

    expect(removed.descriptors).toEqual([second]);
    expect(removed.operation).toBe('removing');
  });

  it('keeps the mirrored registry unchanged when an operation fails', () => {
    const descriptor = localDescriptor('local:opaque-1', 'order.yaml');
    const listed = localScenarioSessionReducer(initialLocalScenarioSessionState, {
      type: 'listed',
      descriptors: [descriptor],
    });
    const failed = localScenarioSessionReducer(listed, {
      type: 'operation_failed',
      error: {
        code: 'scenario_parse_failed',
        message: 'The YAML could not be parsed.',
        retryable: false,
      },
    });

    expect(failed.descriptors).toEqual([descriptor]);
    expect(failed.error?.code).toBe('scenario_parse_failed');
  });

  it('tracks loading, cancellation, and the operation that failed', () => {
    const importing = localScenarioSessionReducer(initialLocalScenarioSessionState, {
      type: 'operation_started',
      operation: 'importing',
    });
    expect(importing.operation).toBe('importing');

    const cancelled = localScenarioSessionReducer(importing, { type: 'operation_cancelled' });
    expect(cancelled.operation).toBe('idle');
    expect(cancelled.error).toBeNull();

    const saving = localScenarioSessionReducer(cancelled, {
      type: 'operation_started',
      operation: 'saving',
    });
    const failed = localScenarioSessionReducer(saving, {
      type: 'operation_failed',
      error: { code: 'scenario_write_failed', message: 'Permission denied.', retryable: true },
    });
    expect(failed.operation).toBe('idle');
    expect(failed.errorOperation).toBe('saving');
  });

  it('adds a Save as copy only under the backend-issued identity', () => {
    const original = localDescriptor('local:opaque-1', 'order.yaml');
    const copy = localDescriptor('local:opaque-2', 'order-copy.yaml');
    const listed = localScenarioSessionReducer(initialLocalScenarioSessionState, {
      type: 'listed',
      descriptors: [original],
    });
    const saving = localScenarioSessionReducer(listed, {
      type: 'operation_started',
      operation: 'saving_as',
    });
    const saved = localScenarioSessionReducer(saving, {
      type: 'operation_succeeded',
      descriptor: copy,
      message: 'order-copy.yaml saved',
    });

    expect(saved.descriptors.map((descriptor) => descriptor.id)).toEqual([
      'local:opaque-1',
      'local:opaque-2',
    ]);
    expect(saved.successMessage).toBe('order-copy.yaml saved');
  });
});
