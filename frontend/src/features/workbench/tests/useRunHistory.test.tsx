// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRunHistory,
  deleteRunHistory,
  getRunHistory,
  listRunHistory,
} from '../../../api/runHistory';
import { useRunHistory, type RunHistoryController } from '../useRunHistory';
import type { HistorySummary } from '../historyTypes';

vi.mock('../../../api/runHistory', () => ({
  clearRunHistory: vi.fn(),
  deleteRunHistory: vi.fn(),
  getRunHistory: vi.fn(),
  listRunHistory: vi.fn(),
}));

const summaryModel = {
  runId: 'run-1',
  scenarioId: 'checkout',
  scenarioSource: 'example',
  scenarioReference: '',
  scenarioName: 'Checkout flow',
  rootTopic: 'order.created',
  status: 'completed',
  startedAt: '2026-08-26T10:00:00Z',
  finishedAt: '2026-08-26T10:00:01Z',
  durationMs: 1000,
  eventCount: 0,
  outcome: '0 events captured',
};

const summary: HistorySummary = {
  id: 'run-1',
  scenarioName: 'Checkout flow',
  scenarioSource: 'example',
  scenarioId: 'checkout',
  scenarioPath: '',
  rootTopic: 'order.created',
  status: 'completed',
  startedAt: summaryModel.startedAt,
  finishedAt: summaryModel.finishedAt,
  durationMs: 1000,
  eventCount: 0,
  outcome: '0 events captured',
  failureStage: null,
  failureMessage: null,
  connectionName: null,
};

const detailModel = {
  summary: summaryModel,
  scenario: {
    version: 1,
    source: 'example',
    reference: '',
    displayName: 'Checkout flow',
    rootTopic: 'order.created',
    messageKey: '',
    payload: '{}',
    headers: [],
    watchedTopics: [],
    correlationHeader: '',
    captureTimeoutSeconds: 10,
    topology: [],
  },
  records: [],
  trackedTopics: [],
};

const roots: Array<ReturnType<typeof createRoot>> = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function HistoryProbe({ onChange }: { onChange: (controller: RunHistoryController) => void }) {
  onChange(useRunHistory('scenario-1', 'workspace-1'));
  return null;
}

function renderHistory(onChange: (controller: RunHistoryController) => void) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<HistoryProbe onChange={onChange} />));
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

beforeEach(() => vi.clearAllMocks());

describe('useRunHistory request lifecycles', () => {
  it('does not strand detail loading when a list refresh completes', async () => {
    const initialList = deferred<Awaited<ReturnType<typeof listRunHistory>>>();
    const refreshedList = deferred<Awaited<ReturnType<typeof listRunHistory>>>();
    const detail = deferred<Awaited<ReturnType<typeof getRunHistory>>>();
    vi.mocked(listRunHistory)
      .mockReturnValueOnce(initialList.promise)
      .mockReturnValueOnce(refreshedList.promise);
    vi.mocked(getRunHistory).mockReturnValue(detail.promise);
    let controller!: RunHistoryController;
    renderHistory((next) => {
      controller = next;
    });

    await act(async () => {
      initialList.resolve({ ok: true, data: [summaryModel] });
      await initialList.promise;
    });
    act(() => void controller.selectRun(summary));
    act(() => void controller.refresh());
    await act(async () => {
      refreshedList.resolve({ ok: true, data: [summaryModel] });
      await refreshedList.promise;
    });
    expect(controller.detailStatus).toBe('loading');

    await act(async () => {
      detail.resolve({ ok: true, data: detailModel });
      await detail.promise;
    });
    expect(controller.detailStatus).toBe('ready');
    expect(controller.selectedRun?.summary.id).toBe('run-1');
  });

  it('keeps list loading valid when switching away and back before refresh completes', async () => {
    const list = deferred<Awaited<ReturnType<typeof listRunHistory>>>();
    vi.mocked(listRunHistory).mockReturnValue(list.promise);
    let controller!: RunHistoryController;
    renderHistory((next) => {
      controller = next;
    });

    act(() => controller.setMode('current'));
    act(() => controller.setMode('history'));
    await act(async () => {
      list.resolve({ ok: true, data: [summaryModel] });
      await list.promise;
    });

    expect(controller.listStatus).toBe('ready');
    expect(controller.summaries).toHaveLength(1);
  });

  it('does not strand delete or clear when a list refresh completes', async () => {
    const firstList = Promise.resolve({ ok: true as const, data: [summaryModel] });
    const deleteRefresh = deferred<Awaited<ReturnType<typeof listRunHistory>>>();
    const clearRefresh = deferred<Awaited<ReturnType<typeof listRunHistory>>>();
    const deletion = deferred<Awaited<ReturnType<typeof deleteRunHistory>>>();
    const clearing = deferred<Awaited<ReturnType<typeof clearRunHistory>>>();
    vi.mocked(listRunHistory)
      .mockReturnValueOnce(firstList)
      .mockReturnValueOnce(deleteRefresh.promise)
      .mockResolvedValueOnce({ ok: true, data: [summaryModel] })
      .mockReturnValueOnce(clearRefresh.promise);
    vi.mocked(deleteRunHistory).mockReturnValue(deletion.promise);
    vi.mocked(clearRunHistory).mockReturnValue(clearing.promise);
    let controller!: RunHistoryController;
    renderHistory((next) => {
      controller = next;
    });
    await act(async () => await firstList);

    const deletePromise = controller.deleteRun('run-1');
    act(() => void controller.refresh());
    await act(async () => {
      deleteRefresh.resolve({ ok: true, data: [summaryModel] });
      await deleteRefresh.promise;
    });
    await act(async () => {
      deletion.resolve({ ok: true, data: {} });
      await deletion.promise;
      await deletePromise;
    });
    expect(controller.operation).toBe('idle');
    expect(controller.summaries).toEqual([]);

    await act(async () => {
      await controller.refresh();
    });
    const clearPromise = controller.clearAll();
    act(() => void controller.refresh());
    await act(async () => {
      clearRefresh.resolve({ ok: true, data: [summaryModel] });
      await clearRefresh.promise;
      clearing.resolve({ ok: true, data: {} });
      await clearing.promise;
      await clearPromise;
    });
    expect(controller.operation).toBe('idle');
  });
});
