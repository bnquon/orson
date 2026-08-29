import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { initialRunState } from '../../runReducer';
import type { HistoricalRun } from '../../historyTypes';
import { HistoricalRunPanel } from '../../components/HistoricalRunPanel';
import { HistoricalRunToolbar } from '../../components/HistoricalRunToolbar';

const record = {
  topic: 'order.created',
  key: '',
  value: '{}',
  headers: [],
  partition: 0,
  offset: '1',
  timestamp: '2026-08-27T07:49:39.051Z',
};

const historicalRun: HistoricalRun = {
  summary: {
    id: 'run-1',
    scenarioName: 'Checkout flow',
    scenarioSource: 'example',
    scenarioId: 'checkout',
    scenarioPath: '',
    rootTopic: 'order.created',
    status: 'completed',
    startedAt: '2026-08-27T07:49:37.051Z',
    finishedAt: '2026-08-27T07:49:39.051Z',
    durationMs: 2000,
    eventCount: 1,
    outcome: '1 event captured',
    failureStage: null,
    failureMessage: null,
    connectionName: 'Local Kafka',
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
    status: 'completed',
    rootRecord: record,
    records: [record],
  },
  records: [record],
};

describe('HistoricalRunPanel', () => {
  it('renders the historical summary and historical flow', () => {
    const markup = renderToStaticMarkup(
      <HistoricalRunPanel
        run={historicalRun}
        detailStatus="ready"
        errorMessage={null}
        selectedRecordId={null}
        onSelectRecord={vi.fn()}
        onBackToHistory={vi.fn()}
      />,
    );

    expect(markup).toContain('Events captured');
    expect(markup).toContain('Historical event flow');
    expect(markup).not.toContain('Recorded result');
    expect(markup).not.toContain('Publish');
  });

  it('does not render the current flow while historical details are loading', () => {
    const markup = renderToStaticMarkup(
      <HistoricalRunPanel
        run={null}
        detailStatus="loading"
        errorMessage={null}
        selectedRecordId={null}
        onSelectRecord={vi.fn()}
        onBackToHistory={vi.fn()}
      />,
    );

    expect(markup).toContain('Loading historical run');
    expect(markup).not.toContain('flow-panel');
  });

  it('offers a recovery path when the historical run is unavailable', () => {
    const markup = renderToStaticMarkup(
      <HistoricalRunPanel
        run={null}
        detailStatus="failed"
        errorMessage="Run history could not be loaded."
        selectedRecordId={null}
        onSelectRecord={vi.fn()}
        onBackToHistory={vi.fn()}
      />,
    );

    expect(markup).toContain('Historical run unavailable');
    expect(markup).toContain('Run history could not be loaded.');
    expect(markup).toContain('Back to history');
  });
});

describe('HistoricalRunToolbar', () => {
  it('identifies the active run as a read-only historical snapshot', () => {
    const markup = renderToStaticMarkup(
      <HistoricalRunToolbar summary={historicalRun.summary} onReturnToCurrent={vi.fn()} />,
    );

    expect(markup).toContain('Historical run');
    expect(markup).toContain('Checkout flow');
    expect(markup).toContain('Read-only');
    expect(markup).toContain('Current workspace');
  });

  it('identifies runs from unsaved scenarios', () => {
    const markup = renderToStaticMarkup(
      <HistoricalRunToolbar
        summary={{ ...historicalRun.summary, scenarioSource: 'unsaved' }}
        onReturnToCurrent={vi.fn()}
      />,
    );

    expect(markup).toContain('Unsaved scenario');
  });
});
