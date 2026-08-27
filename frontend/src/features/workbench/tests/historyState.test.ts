import { describe, expect, it } from 'vitest';
import { historyReducer, initialHistoryState } from '../useRunHistory';
import type { HistorySummary } from '../historyTypes';

const summary: HistorySummary = {
  id: 'run-1',
  scenarioName: 'Checkout flow',
  scenarioSource: 'example',
  scenarioId: 'checkout',
  scenarioPath: '',
  rootTopic: 'order.created',
  status: 'completed',
  startedAt: '2026-08-26T10:00:00Z',
  finishedAt: '2026-08-26T10:00:01Z',
  durationMs: 1000,
  eventCount: 1,
  outcome: '1 event captured',
  failureStage: null,
  failureMessage: null,
  connectionName: null,
};

describe('history state', () => {
  it('starts in current mode and keeps history selection through list refreshes', () => {
    let state = historyReducer(initialHistoryState, { type: 'mode', mode: 'history' });
    state = historyReducer(state, { type: 'list_loaded', summaries: [summary] });
    state = historyReducer(state, { type: 'select_loading', summary });

    expect(state.mode).toBe('historical');
    expect(state.selectedSummary?.id).toBe('run-1');

    state = historyReducer(state, { type: 'list_loaded', summaries: [summary] });
    expect(state.mode).toBe('historical');
    expect(state.selectedSummary?.id).toBe('run-1');
  });

  it('returns to history after deleting the selected run', () => {
    let state = historyReducer(initialHistoryState, { type: 'select_loading', summary });
    state = historyReducer(state, { type: 'deleted', id: 'run-1' });

    expect(state.mode).toBe('history');
    expect(state.selectedSummary).toBeNull();
    expect(state.summaries).toEqual([]);
  });

  it('keeps a valid history list usable when historical detail loading fails', () => {
    let state = historyReducer(initialHistoryState, { type: 'mode', mode: 'history' });
    state = historyReducer(state, { type: 'list_loaded', summaries: [summary] });
    state = historyReducer(state, { type: 'select_loading', summary });
    state = historyReducer(state, {
      type: 'detail_failed',
      error: { code: 'history_failed', message: 'Run detail failed', retryable: true },
    });

    expect(state.listStatus).toBe('ready');
    expect(state.summaries).toEqual([summary]);
    expect(state.detailStatus).toBe('failed');
    expect(state.error?.message).toBe('Run detail failed');
  });

  it('re-enables history actions after a delete or clear failure without losing summaries', () => {
    let state = historyReducer(initialHistoryState, { type: 'mode', mode: 'history' });
    state = historyReducer(state, { type: 'list_loaded', summaries: [summary] });
    state = historyReducer(state, { type: 'operation', operation: 'clearing' });
    state = historyReducer(state, {
      type: 'operation_failed',
      error: { code: 'history_failed', message: 'History failed', retryable: true },
    });

    expect(state.operation).toBe('idle');
    expect(state.listStatus).toBe('ready');
    expect(state.summaries).toEqual([summary]);
    expect(state.error?.message).toBe('History failed');
  });

  it('shows the empty state after clearing history from a previous list error', () => {
    let state = historyReducer(initialHistoryState, {
      type: 'list_failed',
      error: {
        code: 'history_failed',
        message: 'History failed',
        retryable: true,
      },
    });
    state = historyReducer(state, { type: 'cleared' });

    expect(state.listStatus).toBe('ready');
    expect(state.error).toBeNull();
    expect(state.summaries).toEqual([]);
  });

  it('preserves historical mode while history data is refreshed', () => {
    let state = historyReducer(initialHistoryState, { type: 'select_loading', summary });
    state = historyReducer(state, { type: 'list_loading' });
    state = historyReducer(state, { type: 'list_loaded', summaries: [summary] });

    expect(state.mode).toBe('historical');
    expect(state.selectedSummary?.id).toBe('run-1');
  });

  it('resets all history state when the workspace context resets', () => {
    let state = historyReducer(initialHistoryState, { type: 'select_loading', summary });
    state = historyReducer(state, {
      type: 'detail_failed',
      error: {
        code: 'history_failed',
        message: 'Run detail failed',
        retryable: true,
      },
    });

    expect(historyReducer(state, { type: 'reset' })).toEqual(initialHistoryState);
  });
});
