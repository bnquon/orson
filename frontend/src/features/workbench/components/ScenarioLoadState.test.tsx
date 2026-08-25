import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ScenarioDiagnostics,
  ScenarioFileOperationError,
  ScenarioLoadState,
  ScenarioSelectionLoadError,
} from './ScenarioLoadState';

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

    expect(markup).toContain('Scenario discovery failed.');
    expect(markup).toContain('unexpected mapping');
  });

  it('renders the selected filename, technical details, and retry action', () => {
    const markup = renderToStaticMarkup(
      <ScenarioSelectionLoadError
        descriptor={{
          id: 'checkout/successful-order.yaml',
          displayName: 'Successful order',
          relativePath: 'checkout/successful-order.yaml',
          folderPath: 'checkout',
          sourceFilename: 'scenarios/checkout/successful-order.yaml',
          source: 'example',
          sourcePath: '',
          localStatus: null,
          status: 'valid',
          warnings: [],
          diagnostics: [],
        }}
        error={{
          code: 'scenario_load_failed',
          message: 'The selected scenario could not be loaded.',
          details: 'backend returned an invalid scenario response',
          retryable: true,
        }}
        diagnostics={[]}
        onRetry={() => undefined}
      />,
    );

    expect(markup).toContain('successful-order.yaml could not be loaded');
    expect(markup).toContain('scenarios/checkout/successful-order.yaml');
    expect(markup).toContain('backend returned an invalid scenario response');
    expect(markup).toContain('Retry loading scenario');
  });

  it('renders invalid selection diagnostics without offering retry', () => {
    const markup = renderToStaticMarkup(
      <ScenarioSelectionLoadError
        descriptor={{
          id: 'broken.yaml',
          displayName: 'Broken',
          relativePath: 'broken.yaml',
          folderPath: '',
          sourceFilename: 'scenarios/broken.yaml',
          source: 'example',
          sourcePath: '',
          localStatus: null,
          status: 'invalid',
          warnings: [],
          diagnostics: [
            {
              code: 'scenario_yaml_invalid',
              path: 'publish.payload',
              message: 'Payload is not valid JSON.',
              details: 'unexpected token',
              sourceFilename: 'scenarios/broken.yaml',
              line: 8,
              column: 4,
            },
          ],
        }}
        error={{
          code: 'scenario_invalid',
          message: 'scenarios/broken.yaml is invalid.',
          retryable: false,
        }}
        diagnostics={[
          {
            code: 'scenario_yaml_invalid',
            path: 'publish.payload',
            message: 'Payload is not valid JSON.',
            details: 'unexpected token',
            sourceFilename: 'scenarios/broken.yaml',
            line: 8,
            column: 4,
          },
        ]}
      />,
    );

    expect(markup).toContain('broken.yaml could not be loaded');
    expect(markup).toContain('scenarios/broken.yaml:8:4');
    expect(markup).toContain('Technical details');
    expect(markup).not.toContain('Retry loading scenario');
  });

  it('shows import diagnostics with filename, field path, line, column, and details', () => {
    const markup = renderToStaticMarkup(
      <ScenarioFileOperationError
        error={{
          code: 'scenario_parse_failed',
          message: 'payment.yaml could not be imported.',
          retryable: false,
        }}
        diagnostics={[
          {
            code: 'unknown_yaml_field',
            path: 'publish.unsupported',
            message: 'The scenario YAML contains an unknown field.',
            details: 'field "unsupported" is not supported',
            sourceFilename: 'payment.yaml',
            line: 7,
            column: 5,
          },
        ]}
        onDismiss={() => undefined}
      />,
    );

    expect(markup).toContain('payment.yaml:7:5');
    expect(markup).toContain('publish.unsupported');
    expect(markup).toContain('The scenario YAML contains an unknown field.');
    expect(markup).toContain('Technical details');
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
