import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScenarioBrowser, ScenarioRows } from '../../components/ScenarioBrowser';
import type { ScenarioDescriptor } from '../../types';
import { buildScenarioTree } from '../../scenarioTree';

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
    source: 'example',
    sourcePath: '',
    localStatus: null,
    status: 'valid',
    warnings: [],
    diagnostics: [],
  };
}

describe('ScenarioBrowser', () => {
  it('renders catalog loading and filtered empty states', () => {
    const loading = renderToStaticMarkup(
      <ScenarioBrowser
        examples={[]}
        localScenarios={[]}
        selectedScenarioId={null}
        activeScenarioId="order-flow.yaml"
        scenarioLoadingId={null}
        scenarioCatalogLoading
        scenarioSelectionDisabled={false}
        activeScenarioDirty={false}
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
      />,
    );

    expect(loading).toContain('Discovering examples');

    const empty = renderToStaticMarkup(
      <ScenarioBrowser
        examples={[]}
        localScenarios={[]}
        selectedScenarioId={null}
        activeScenarioId="order-flow.yaml"
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled={false}
        activeScenarioDirty={false}
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
      />,
    );

    expect(empty).toContain('No matching examples.');
    expect(empty).toContain('No local scenarios yet. Import a YAML file below');
    expect(empty).toContain('scenario-sidebar__footer');
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
        examples={[descriptor('checkout/retries/retry.yaml', 'checkout/retries')]}
        localScenarios={[]}
        selectedScenarioId={null}
        activeScenarioId="checkout/retries/retry.yaml"
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled={false}
        activeScenarioDirty={false}
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
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

  it('shows local filenames, path tooltips, dirty state, and import progress', () => {
    const local = {
      ...descriptor('local:opaque-1', ''),
      displayName: 'Imported order',
      relativePath: 'imported-order.yaml',
      sourceFilename: 'imported-order.yaml',
      source: 'local' as const,
      sourcePath: '/Users/me/scenarios/imported-order.yaml',
      localStatus: 'available' as const,
    };
    const markup = renderToStaticMarkup(
      <ScenarioBrowser
        examples={[]}
        localScenarios={[local]}
        selectedScenarioId={local.id}
        activeScenarioId={local.id}
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled={false}
        activeScenarioDirty
        fileOperation="importing"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
      />,
    );

    expect(markup).toContain('My scenarios');
    expect(markup).toContain('imported-order.yaml');
    expect(markup).toContain('/Users/me/scenarios/imported-order.yaml');
    expect(markup).toContain('Unsaved changes');
    expect(markup).toContain('Importing YAML');
    expect(markup).toContain('scenario-sidebar__footer');
    expect(markup.indexOf('Save actions')).toBeLessThan(markup.indexOf('Importing YAML'));
  });

  it('uses warning styling for externally changed local files', () => {
    const local = {
      ...descriptor('local:changed', ''),
      sourceFilename: 'changed.yaml',
      source: 'local' as const,
      sourcePath: '/Users/me/changed.yaml',
      localStatus: 'changed' as const,
    };
    const markup = renderToStaticMarkup(
      <ScenarioBrowser
        examples={[]}
        localScenarios={[local]}
        selectedScenarioId={local.id}
        activeScenarioId="order-flow.yaml"
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled={false}
        activeScenarioDirty={false}
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
      />,
    );

    expect(markup).toContain('File changed outside Orson');
    expect(markup).toContain('scenario-row__status--warning');
    expect(markup).toContain('scenario-row__status-icon--error');
    expect(markup).toContain('Remove changed.yaml from this workspace');
    expect(markup).not.toContain('scenario-row__status--valid"');
  });

  it('renders session-owned Examples dismissal and disables replacement controls', () => {
    const markup = renderToStaticMarkup(
      <ScenarioBrowser
        examples={[descriptor('order-flow.yaml', '')]}
        localScenarios={[]}
        selectedScenarioId="order-flow.yaml"
        activeScenarioId="order-flow.yaml"
        scenarioLoadingId="order-flow.yaml"
        scenarioCatalogLoading={false}
        examplesExpanded
        examplesDismissed
        scenarioSelectionDisabled
        activeScenarioDirty={false}
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
      />,
    );

    expect(markup).toContain('Examples hidden');
    expect(markup).toContain('Restore');
    expect(markup).toContain('Import YAML');
    expect(markup.match(/Import YAML<\/button>/g)).toHaveLength(1);
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-describedby=');
    expect(markup).toContain('Finish the active run before importing another scenario');
  });
});
