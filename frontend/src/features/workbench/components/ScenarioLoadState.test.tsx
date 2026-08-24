import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScenarioDiagnostics, ScenarioLoadState } from './ScenarioLoadState';

describe('ScenarioLoadState', () => {
  it('renders a compact loading state', () => {
    const markup = renderToStaticMarkup(<ScenarioLoadState status="loading" />);

    expect(markup).toContain('Loading scenario');
    expect(markup).toContain('loading-dots');
  });

  it('renders source and backend details for a failed load', () => {
    const markup = renderToStaticMarkup(
      <ScenarioLoadState
        status="failed"
        error={{
          code: 'scenario_parse_failed',
          message: 'The bundled scenario YAML could not be parsed.',
          details: 'scenarios/order-flow.yaml:4:7: unexpected mapping',
          retryable: false,
        }}
      />,
    );

    expect(markup).toContain('Source: scenarios/order-flow.yaml');
    expect(markup).toContain('unexpected mapping');
  });
});

describe('ScenarioDiagnostics', () => {
  it('renders warning count and keeps details expandable', () => {
    const markup = renderToStaticMarkup(
      <ScenarioDiagnostics
        warnings={[
          {
            code: 'duplicate_topology_edge',
            message: 'duplicate edge omitted',
            sourceFilename: 'scenarios/order-flow.yaml',
            line: 22,
            column: 3,
          },
        ]}
        sourceFilename="scenarios/order-flow.yaml"
        dismissed={false}
        onDismiss={() => undefined}
      />,
    );

    expect(markup).toContain('order-flow.yaml loaded with 1 warning');
    expect(markup).toContain('aria-expanded="false"');
  });

  it('hides diagnostics after dismissal', () => {
    const markup = renderToStaticMarkup(
      <ScenarioDiagnostics
        warnings={[
          {
            code: 'duplicate_topology_edge',
            message: 'duplicate edge omitted',
            sourceFilename: 'scenarios/order-flow.yaml',
            line: 22,
            column: 3,
          },
        ]}
        sourceFilename="scenarios/order-flow.yaml"
        dismissed
        onDismiss={() => undefined}
      />,
    );

    expect(markup).toBe('');
  });
});
