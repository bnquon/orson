// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsOn } from '../../../../wailsjs/runtime/runtime';
import { startRun } from '../../../api/run';
import { preflightErrorCodes } from '../../../api/result';
import { useRun, type RunController } from '../useRun';
import type { RunEvent } from '../types';
import type { api } from '../../../../wailsjs/go/models';

vi.mock('../../../api/run', () => ({ startRun: vi.fn(), stopRun: vi.fn() }));
vi.mock('../../../../wailsjs/runtime/runtime', () => ({ EventsOn: vi.fn() }));

let root: ReturnType<typeof createRoot>;
let controller: RunController;
let emit: (event: RunEvent) => void;
const request = {
  rootTopic: 'orders',
  watchedTopics: ['payments'],
  payload: '{"draft":true}',
} as api.RunRequest;

function Probe({ onChange }: { onChange: (value: RunController) => void }) {
  onChange(useRun());
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(EventsOn).mockImplementation((name, callback) => {
    if (name === 'run:event') emit = callback;
    return () => undefined;
  });
  root = createRoot(document.createElement('div'));
  act(() =>
    root.render(
      <Probe
        onChange={(value) => {
          controller = value;
        }}
      />,
    ),
  );
});
afterEach(() => act(() => root.unmount()));

describe('run preflight', () => {
  it('checks without a live timeline, preserves the request, and allows retry', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof startRun>>) => void;
    vi.mocked(startRun).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const before = JSON.stringify(request);
    let pending!: Promise<void>;
    act(() => {
      pending = controller.startRun(request);
    });
    expect(controller.state.status).toBe('checking');
    expect(controller.state.runId).toBeNull();
    expect(controller.state.trackedEvents).toEqual([]);
    await act(async () => {
      resolve({
        ok: false,
        error: {
          code: preflightErrorCodes.metadataUnavailable,
          message: 'Cannot check metadata',
          retryable: true,
        },
      });
      await pending;
    });
    expect(controller.state.status).toBe('idle');
    expect(controller.state.records).toEqual([]);
    expect(controller.state.trackedEvents).toEqual([]);
    expect(JSON.stringify(request)).toBe(before);
    vi.mocked(startRun).mockResolvedValueOnce({ ok: true, data: { runId: 'retry' } });
    await act(async () => controller.startRun(request));
    expect(startRun).toHaveBeenCalledTimes(2);
    expect(startRun).toHaveBeenLastCalledWith(request);
    expect(controller.state.status).toBe('starting');
    expect(controller.state.error).toBeNull();
  });

  it.each(['completed', 'failed'] as const)(
    'preserves %s events arriving before the response',
    async (status) => {
      let resolve!: (value: Awaited<ReturnType<typeof startRun>>) => void;
      vi.mocked(startRun).mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      );
      let pending!: Promise<void>;
      act(() => {
        pending = controller.startRun(request);
      });
      act(() => {
        emit({ runId: 'early', sequence: 1, kind: 'started' });
        emit({ runId: 'early', sequence: 2, kind: 'ready' });
        emit({
          runId: 'early',
          sequence: 3,
          kind: 'finished',
          status,
          ...(status === 'failed'
            ? { error: { code: 'capture_failed', message: 'Topic disappeared', retryable: true } }
            : {}),
        });
      });
      await act(async () => {
        resolve({ ok: true, data: { runId: 'early' } });
        await pending;
      });
      expect(controller.state.status).toBe(status);
      expect(controller.state.trackedEvents[0].status).toBe(
        status === 'failed' ? 'failed' : 'unwitnessed',
      );
    },
  );
});
