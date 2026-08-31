import { describe, expect, it } from 'vitest';
import {
  buildScenarioTree,
  getDescendantFolderIds,
  getScenarioTreeFolderPaths,
} from '../scenarioTree';
import type { ScenarioDescriptor, ScenarioFolder } from '../types';

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

  it('collects nested descendant folder ids', () => {
    const folders: ScenarioFolder[] = [
      { id: 'orders', name: 'Orders', parentId: '', siblingOrder: 0 },
      { id: 'retries', name: 'Retries', parentId: 'orders', siblingOrder: 0 },
      { id: 'dead-letter', name: 'Dead letter', parentId: 'retries', siblingOrder: 0 },
      { id: 'other', name: 'Other', parentId: '', siblingOrder: 1 },
    ];

    expect(getDescendantFolderIds(folders, 'orders')).toEqual(
      new Set(['orders', 'retries', 'dead-letter']),
    );
  });

  it('preserves persisted folder and sibling ordering while filtering ancestors', () => {
    const folders: ScenarioFolder[] = [
      { id: 'folder-orders', name: 'Orders', parentId: '', siblingOrder: 1 },
      { id: 'folder-empty', name: 'Empty', parentId: '', siblingOrder: 0 },
      { id: 'folder-retries', name: 'Retries', parentId: 'folder-orders', siblingOrder: 0 },
    ];
    const scenarios = [
      { ...descriptor('retry.yaml', '', 'Retry'), folderId: 'folder-retries', siblingOrder: 0 },
      { ...descriptor('order.yaml', '', 'Order'), folderId: 'folder-orders', siblingOrder: 1 },
      { ...descriptor('draft.yaml', '', 'Draft'), folderId: 'folder-orders', siblingOrder: 0 },
    ];

    const tree = buildScenarioTree(scenarios, '', folders);
    expect(tree.folders.map((folder) => folder.name)).toEqual(['Empty', 'Orders']);
    expect(tree.folders[1].folders[0].name).toBe('Retries');
    expect(tree.folders[1].scenarios.map((item) => item.displayName)).toEqual(['Draft', 'Order']);

    const filtered = buildScenarioTree(scenarios, 'retry', folders);
    expect(filtered.folders.map((folder) => folder.name)).toEqual(['Orders']);
    expect(filtered.folders[0].folders.map((folder) => folder.name)).toEqual(['Retries']);
    expect(filtered.folders[0].folders[0].scenarios.map((item) => item.id)).toEqual(['retry.yaml']);
  });
});
