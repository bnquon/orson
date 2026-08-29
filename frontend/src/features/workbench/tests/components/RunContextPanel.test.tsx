import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { initialRunState } from '../../runReducer';
import type { RunHistoryController } from '../../useRunHistory';
import type { ObservedRun } from '../../types';
import { formatHistoryRelativeTime, RunContextPanel } from '../../components/RunContextPanel';

const currentRun: ObservedRun = {
  id: 'run-live',
  status: 'completed',
  events: [
    {
      id: 'run-live:order.created:0:1',
      name: 'Root event published',
      topic: 'order.created',
      kind: 'root',
      timestamp: '2026-08-26T10:00:00Z',
      elapsed: '',
      partition: 0,
      offset: '1',
      metadata: 'Kafka · 2 B · observed live',
      headers: [],
      payload: '{}',
    },
  ],
  trackedEvents: [],
  error: null,
};

function historyController(overrides: Partial<RunHistoryController> = {}): RunHistoryController {
  return {
    mode: 'current',
    summaries: [],
    selectedSummary: null,
    selectedRun: null,
    selectedRecordId: null,
    listStatus: 'ready',
    detailStatus: 'idle',
    operation: 'idle',
    error: null,
    setMode: vi.fn(),
    selectRecord: vi.fn(),
    selectRun: vi.fn(() => Promise.resolve()),
    refresh: vi.fn(() => Promise.resolve()),
    deleteRun: vi.fn(() => Promise.resolve(true)),
    clearAll: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  };
}

describe('RunContextPanel', () => {
  it('formats recent history timestamps compactly', () => {
    expect(
      formatHistoryRelativeTime('2026-08-26T10:00:00Z', Date.parse('2026-08-26T10:00:35Z')),
    ).toBe('just now');
    expect(
      formatHistoryRelativeTime('2026-08-26T09:00:00Z', Date.parse('2026-08-26T10:00:00Z')),
    ).toBe('1h ago');
  });

  it('defaults to the live current-run presentation', () => {
    const markup = renderToStaticMarkup(
      <RunContextPanel
        currentRun={currentRun}
        currentSelectedEventId={currentRun.events[0].id}
        currentSelectedEvent={currentRun.events[0]}
        onSelectCurrentEvent={() => undefined}
        history={historyController()}
      />,
    );

    expect(markup).toContain('Current run');
    expect(markup).toContain('Chronological sequence');
    expect(markup).toContain('Root event published');
  });

  it('renders compact history rows and the local payload privacy note', () => {
    const markup = renderToStaticMarkup(
      <RunContextPanel
        currentRun={currentRun}
        currentSelectedEventId={null}
        currentSelectedEvent={null}
        onSelectCurrentEvent={() => undefined}
        history={historyController({
          mode: 'history',
          summaries: [
            {
              id: 'run-1',
              scenarioName: 'Checkout flow',
              scenarioSource: 'unsaved',
              scenarioId: 'checkout',
              scenarioPath: '',
              rootTopic: 'order.created',
              status: 'completed',
              startedAt: '2026-08-26T10:00:00Z',
              finishedAt: '2026-08-26T10:00:02Z',
              durationMs: 2000,
              eventCount: 4,
              outcome: '4 events captured',
              failureStage: null,
              failureMessage: null,
              connectionName: null,
            },
          ],
        })}
      />,
    );

    expect(markup).toContain('Checkout flow');
    expect(markup).toContain('Unsaved');
    expect(markup).toContain('4 events captured');
    expect(markup).toContain('captured Kafka payloads and headers');
    expect(markup).toContain('history-filter');
    expect(markup).toContain('All');
    expect(markup).toContain('Completed');
    expect(markup).not.toContain('history-filter--failed');
    expect(markup).toContain('Clear all history');
  });

  it('marks a selected historical run read-only and does not expose publish controls', () => {
    const historicalRun = {
      summary: {
        id: 'run-1',
        scenarioName: 'Checkout flow',
        scenarioSource: 'example' as const,
        scenarioId: 'checkout',
        scenarioPath: '',
        rootTopic: 'order.created',
        status: 'completed' as const,
        startedAt: '',
        finishedAt: '',
        durationMs: 10,
        eventCount: 1,
        outcome: '1 event captured',
        failureStage: null,
        failureMessage: null,
        connectionName: null,
      },
      scenario: {
        name: 'Checkout flow',
        rootTopic: 'order.created',
        watchedTopics: [],
        topology: [],
        configuredTopology: [],
        messageKey: '',
        headers: [],
        correlationHeader: '',
        payload: '{}',
        captureTimeoutSeconds: '10',
      },
      run: {
        ...initialRunState,
        runId: 'run-1',
        status: 'failed' as const,
        error: {
          code: 'capture_failed',
          message: 'Kafka capture failed',
          details: 'The broker closed the connection.',
          retryable: false,
        },
      },
      records: [],
    };
    const markup = renderToStaticMarkup(
      <RunContextPanel
        currentRun={currentRun}
        currentSelectedEventId={null}
        currentSelectedEvent={null}
        onSelectCurrentEvent={() => undefined}
        history={historyController({ mode: 'historical', selectedRun: historicalRun })}
      />,
    );

    expect(markup).toContain('Historical run');
    expect(markup).toContain('Read-only run');
    expect(markup).toContain('Kafka capture failed');
    expect(markup).toContain('The broker closed the connection.');
    expect(markup).toContain('Back to run history');
  });

  it('uses warning styling for timed-out current runs', () => {
    const markup = renderToStaticMarkup(
      <RunContextPanel
        currentRun={{
          ...currentRun,
          status: 'timed_out',
          error: { code: 'timeout', message: 'Capture timed out', retryable: false },
        }}
        currentSelectedEventId={null}
        currentSelectedEvent={null}
        onSelectCurrentEvent={() => undefined}
        history={historyController()}
      />,
    );

    expect(markup).toContain('run-context__error--warning');
  });
});
