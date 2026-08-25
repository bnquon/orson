import { describe, expect, it } from 'vitest';
import { buildScenarioTree, getScenarioTreeFolderPaths } from './scenarioTree';
import type { ScenarioDescriptor } from './types';

function descriptor(
  id: string,
  folderPath: string,
  displayName = id.replace(/\.ya?ml$/, ''),
): ScenarioDescriptor {
  return {
    id,
    displayName,
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

describe('buildScenarioTree', () => {
  it('groups nested folders and sorts scenarios deterministically', () => {
    const tree = buildScenarioTree([
      descriptor('checkout/z.yaml', 'checkout', 'Zed'),
      descriptor('order.yaml', '', 'Order'),
      descriptor('checkout/a.yaml', 'checkout', 'Alpha'),
      descriptor('checkout/advanced/retry.yaml', 'checkout/advanced', 'Retry'),
    ]);

    expect(tree.scenarios.map((item) => item.displayName)).toEqual(['Order']);
    expect(tree.folders.map((folder) => folder.name)).toEqual(['checkout']);
    expect(tree.folders[0].scenarios.map((item) => item.displayName)).toEqual(['Alpha', 'Zed']);
    expect(tree.folders[0].folders[0].path).toBe('checkout/advanced');
  });

  it('filters by display name or relative path', () => {
    const tree = buildScenarioTree(
      [
        descriptor('checkout/success.yaml', 'checkout', 'Successful order'),
        descriptor('failed.yaml', '', 'Failed'),
      ],
      'success',
    );

    expect(tree.folders[0].scenarios.map((item) => item.id)).toEqual(['checkout/success.yaml']);
    expect(tree.scenarios).toEqual([]);
  });

  it('collects every folder path needed to reveal nested scenarios', () => {
    const tree = buildScenarioTree([
      descriptor('checkout/retries/retry.yaml', 'checkout/retries', 'Retry'),
    ]);

    expect(getScenarioTreeFolderPaths(tree)).toEqual(new Set(['checkout', 'checkout/retries']));
  });
});
