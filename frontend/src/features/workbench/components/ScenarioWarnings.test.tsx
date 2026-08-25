import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScenarioRows } from './ScenarioBrowser';
import { ScenarioDiagnostics } from './ScenarioLoadState';
import type { ScenarioDescriptor, ScenarioWarning } from '../types';

const warning: ScenarioWarning = {
  code: 'missing_correlation_header',
  message: 'correlation header is missing or blank; x-correlation-id will be used',
  sourceFilename: 'fallback.yaml',
  line: 0,
  column: 0,
};

describe('scenario fallback warning visibility', () => {
  it('marks the runnable scenario as warned in the catalog/sidebar', () => {
    const descriptor: ScenarioDescriptor = {
      id: 'fallback.yaml',
      displayName: 'fallback',
      relativePath: 'fallback.yaml',
      folderPath: '',
      sourceFilename: 'fallback.yaml',
      status: 'valid_with_warnings',
      warnings: [warning],
      diagnostics: [],
    };
    const markup = renderToStaticMarkup(
      <ScenarioRows
        folders={[]}
        scenarios={[descriptor]}
        expandedFolders={new Set()}
        selectedScenarioId="fallback.yaml"
        activeScenarioId="fallback.yaml"
        scenarioLoadingId={null}
        selectionDisabled={false}
        onToggleFolder={() => undefined}
        onSelectScenario={() => undefined}
      />,
    );

    expect(markup).toContain('fallback, 1 scenario warning, active');
    expect(markup).not.toContain('disabled=""');
  });

  it('shows the loaded warning summary in the active workbench', () => {
    const markup = renderToStaticMarkup(
      <ScenarioDiagnostics
        warnings={[warning]}
        sourceFilename="fallback.yaml"
        dismissed={false}
        onDismiss={() => undefined}
      />,
    );

    expect(markup).toContain('fallback.yaml loaded with 1 warning');
    expect(markup).toContain('aria-label="Scenario warnings"');
  });
});
