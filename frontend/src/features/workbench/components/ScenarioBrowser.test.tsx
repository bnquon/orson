import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScenarioBrowser, ScenarioRows } from './ScenarioBrowser';
import type { ScenarioDescriptor } from '../types';
import { buildScenarioTree } from '../scenarioTree';

function descriptor(id: string, folderPath: string): ScenarioDescriptor {
  return {
    id,
    displayName:
      id
        .split('/')
        .at(-1)
        ?.replace(/\.ya?ml$/, '') ?? id,
    relativePath: id,
    folderPath,
    sourceFilename: id,
    status: 'valid',
    warnings: [],
    diagnostics: [],
  };
}

describe('ScenarioBrowser', () => {
  it('renders catalog loading and filtered empty states', () => {
    const loading = renderToStaticMarkup(
      <ScenarioBrowser
        scenarios={[]}
        selectedScenarioId={null}
        activeScenarioId="order-flow.yaml"
        scenarioLoadingId={null}
        scenarioCatalogLoading
        scenarioSelectionDisabled={false}
        onSelectScenario={() => undefined}
      />,
    );

    expect(loading).toContain('Discovering scenarios');

    const empty = renderToStaticMarkup(
      <ScenarioBrowser
        scenarios={[]}
        selectedScenarioId={null}
        activeScenarioId="order-flow.yaml"
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled={false}
        onSelectScenario={() => undefined}
      />,
    );

    expect(empty).toContain('No matching scenarios.');
  });

  it('keeps descendants out of the tab order when a folder is collapsed', () => {
    const scenarios = [
      descriptor('checkout/success.yaml', 'checkout'),
      descriptor('checkout/retries/retry.yaml', 'checkout/retries'),
    ];
    const tree = buildScenarioTree(scenarios);
    const markup = renderToStaticMarkup(
      <ScenarioRows
        folders={tree.folders}
        scenarios={tree.scenarios}
        expandedFolders={new Set()}
        selectedScenarioId={null}
        activeScenarioId="checkout/success.yaml"
        scenarioLoadingId={null}
        selectionDisabled={false}
        onToggleFolder={() => undefined}
        onSelectScenario={() => undefined}
      />,
    );

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(3);
  });

  it('expands every ancestor needed for nested scenarios after catalog data arrives', () => {
    const markup = renderToStaticMarkup(
      <ScenarioBrowser
        scenarios={[descriptor('checkout/retries/retry.yaml', 'checkout/retries')]}
        selectedScenarioId={null}
        activeScenarioId="checkout/retries/retry.yaml"
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled={false}
        onSelectScenario={() => undefined}
      />,
    );

    expect(markup.match(/aria-expanded="true"/g)).toHaveLength(2);
    expect(markup.match(/aria-hidden="false"/g)).toHaveLength(2);
  });

  it('keeps an expanded folder and its nested folder keyboard-accessible', () => {
    const scenarios = [descriptor('checkout/retries/retry.yaml', 'checkout/retries')];
    const tree = buildScenarioTree(scenarios);
    const markup = renderToStaticMarkup(
      <ScenarioRows
        folders={tree.folders}
        scenarios={tree.scenarios}
        expandedFolders={new Set(['checkout'])}
        selectedScenarioId={null}
        activeScenarioId="checkout/retries/retry.yaml"
        scenarioLoadingId={null}
        selectionDisabled={false}
        onToggleFolder={() => undefined}
        onSelectScenario={() => undefined}
      />,
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('tabindex="-1"');
  });
});
