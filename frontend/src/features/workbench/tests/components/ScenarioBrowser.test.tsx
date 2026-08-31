// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScenarioBrowser, ScenarioRows } from '../../components/ScenarioBrowser';
import { getScenarioDropIndex } from '../../components/ScenarioBrowserTree';
import type { ScenarioDescriptor } from '../../types';
import { buildScenarioTree } from '../../scenarioTree';

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

function renderInteractiveBrowser(overrides: Partial<ComponentProps<typeof ScenarioBrowser>> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() =>
    root.render(
      <ScenarioBrowser
        examples={[]}
        localScenarios={[]}
        selectedScenarioId={null}
        activeScenarioId="order-flow.yaml"
        activeScenarioName="order-flow"
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled={false}
        activeScenarioDirty={false}
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onNewScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
        {...overrides}
      />,
    ),
  );
  return host;
}

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
  it('adjusts scenario drop indexes after removing the source row', () => {
    expect(getScenarioDropIndex(0, 1, 'after')).toBe(1);
    expect(getScenarioDropIndex(0, 2, 'before')).toBe(1);
    expect(getScenarioDropIndex(2, 0, 'after')).toBe(1);
    expect(getScenarioDropIndex(-1, 1, 'after')).toBe(2);
  });

  it('opens the scenario format guide with structure, topology, and a valid example', () => {
    const host = renderInteractiveBrowser();
    const guideButton = host.querySelector<HTMLButtonElement>(
      '[aria-label="Scenario format guide"]',
    );

    expect(guideButton).not.toBeNull();
    act(() => guideButton?.click());

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Scenario YAML guide');
    expect(dialog?.textContent).toContain('Topology edges are optional');
    expect(dialog?.textContent).toContain('For a connected flow graph');
    expect(dialog?.textContent).toContain('name: order-flow');
    expect(dialog?.textContent).not.toContain('Open example');
  });

  it('copies the read-only example from the guide', async () => {
    const originalClipboard = navigator.clipboard;
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      const host = renderInteractiveBrowser();
      act(() =>
        host.querySelector<HTMLButtonElement>('[aria-label="Scenario format guide"]')?.click(),
      );
      const copyButton = document.body.querySelector<HTMLButtonElement>(
        'button[aria-label="Copy scenario example"]',
      );

      expect(copyButton).not.toBeNull();
      await act(async () => {
        copyButton?.click();
        await Promise.resolve();
      });

      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('name: order-flow'));
      expect(copyButton?.textContent).toBe('Copied');
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      });
    }
  });

  it('renders catalog loading and filtered empty states', () => {
    const loading = renderToStaticMarkup(
      <ScenarioBrowser
        examples={[]}
        localScenarios={[]}
        selectedScenarioId={null}
        activeScenarioId="order-flow.yaml"
        activeScenarioName="order-flow"
        scenarioLoadingId={null}
        scenarioCatalogLoading
        scenarioSelectionDisabled={false}
        activeScenarioDirty={false}
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onNewScenario={() => undefined}
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
        activeScenarioName="order-flow"
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled={false}
        activeScenarioDirty={false}
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onNewScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
      />,
    );

    expect(empty).toContain('No matching examples.');
    expect(empty).toContain('No local scenarios yet. Import a YAML file below');
    expect(empty).toContain('scenario-sidebar__footer');
  });

  it('shows an unsaved active scenario without adding a sidebar file row', () => {
    const markup = renderToStaticMarkup(
      <ScenarioBrowser
        examples={[]}
        localScenarios={[]}
        selectedScenarioId={null}
        activeScenarioId="scenario-unsaved-1"
        activeScenarioName="Untitled scenario"
        activeScenarioUnsaved
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled={false}
        activeScenarioDirty
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save as</span>}
        onSelectScenario={() => undefined}
        onNewScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
      />,
    );

    expect(markup).toContain('Untitled scenario');
    expect(markup).toContain('Unsaved');
    expect(markup).toContain('New scenario');
    expect(markup).not.toContain('scenario-row--local');
  });

  it('hides local scenario removal in historical read-only mode', () => {
    const local = {
      ...descriptor('local:historical', ''),
      source: 'local' as const,
      sourceFilename: 'historical.yaml',
      sourcePath: '/Users/me/historical.yaml',
      localStatus: 'available' as const,
    };
    const markup = renderToStaticMarkup(
      <ScenarioBrowser
        examples={[]}
        localScenarios={[local]}
        selectedScenarioId={local.id}
        activeScenarioId={local.id}
        activeScenarioName="Historical"
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        readOnly
        scenarioSelectionDisabled={false}
        activeScenarioDirty={false}
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onNewScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
      />,
    );

    expect(markup).toContain('historical.yaml');
    expect(markup).not.toContain('scenario-row__remove');
  });

  it('disables local scenario removal while an unsaved scenario is open', () => {
    const local = {
      ...descriptor('local:protected', ''),
      source: 'local' as const,
      sourceFilename: 'protected.yaml',
      sourcePath: '/Users/me/protected.yaml',
      localStatus: 'available' as const,
    };
    const markup = renderToStaticMarkup(
      <ScenarioBrowser
        examples={[]}
        localScenarios={[local]}
        selectedScenarioId={null}
        activeScenarioId="scenario-unsaved-1"
        activeScenarioName="Untitled scenario"
        activeScenarioUnsaved
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled={false}
        scenarioRemovalDisabled
        activeScenarioDirty
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onNewScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
      />,
    );

    expect(markup).toContain('disabled=""');
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
        activeScenarioName="retry"
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled={false}
        activeScenarioDirty={false}
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onNewScenario={() => undefined}
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
        activeScenarioName="Imported order"
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled={false}
        activeScenarioDirty
        fileOperation="importing"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onNewScenario={() => undefined}
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
        activeScenarioName="order-flow"
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled={false}
        activeScenarioDirty={false}
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onNewScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
      />,
    );

    expect(markup).toContain('File changed outside Orson');
    expect(markup).toContain('scenario-row__status--warning');
    expect(markup).toContain('scenario-row__status-icon--error');
    expect(markup).not.toContain('scenario-row__status--valid"');
  });

  it('renders session-owned Examples dismissal and disables replacement controls', () => {
    const markup = renderToStaticMarkup(
      <ScenarioBrowser
        examples={[descriptor('order-flow.yaml', '')]}
        localScenarios={[]}
        selectedScenarioId="order-flow.yaml"
        activeScenarioId="order-flow.yaml"
        activeScenarioName="order-flow"
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
        onNewScenario={() => undefined}
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

  it('disables hiding examples while scenario replacement is blocked', () => {
    const markup = renderToStaticMarkup(
      <ScenarioBrowser
        examples={[descriptor('order-flow.yaml', '')]}
        localScenarios={[]}
        selectedScenarioId="order-flow.yaml"
        activeScenarioId="order-flow.yaml"
        activeScenarioName="order-flow"
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled
        activeScenarioDirty={false}
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onNewScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
      />,
    );

    expect(markup).toContain('class="scenario-section-dismiss"');
    expect(markup).toContain('aria-label="Hide Examples"');
    expect(markup).toContain('disabled=""');
  });

  it('disables hiding examples during a file operation and catalog loading', () => {
    const fileOperationMarkup = renderToStaticMarkup(
      <ScenarioBrowser
        examples={[descriptor('order-flow.yaml', '')]}
        localScenarios={[]}
        selectedScenarioId="order-flow.yaml"
        activeScenarioId="order-flow.yaml"
        activeScenarioName="order-flow"
        scenarioLoadingId={null}
        scenarioCatalogLoading={false}
        scenarioSelectionDisabled={false}
        activeScenarioDirty={false}
        fileOperation="importing"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onNewScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
      />,
    );
    const loadingMarkup = renderToStaticMarkup(
      <ScenarioBrowser
        examples={[descriptor('order-flow.yaml', '')]}
        localScenarios={[]}
        selectedScenarioId="order-flow.yaml"
        activeScenarioId="order-flow.yaml"
        activeScenarioName="order-flow"
        scenarioLoadingId={null}
        scenarioCatalogLoading
        scenarioSelectionDisabled={false}
        activeScenarioDirty={false}
        fileOperation="idle"
        fileError={null}
        fileErrorOperation={null}
        fileActions={<span>Save actions</span>}
        onSelectScenario={() => undefined}
        onNewScenario={() => undefined}
        onImportScenario={() => undefined}
        onRemoveScenario={() => Promise.resolve('succeeded' as const)}
      />,
    );

    expect(fileOperationMarkup).toContain('Wait for the current scenario file operation to finish');
    expect(loadingMarkup).toContain('Wait for examples to finish loading');
  });
});
