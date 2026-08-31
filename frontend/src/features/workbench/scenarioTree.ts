import type { ScenarioDescriptor, ScenarioFolder } from './types';

export interface ScenarioTreeFolder {
  id: string;
  path: string;
  name: string;
  parentId: string;
  siblingOrder: number;
  folders: ScenarioTreeFolder[];
  scenarios: ScenarioDescriptor[];
}

export interface ScenarioTree {
  folders: ScenarioTreeFolder[];
  scenarios: ScenarioDescriptor[];
}

export function getScenarioTreeFolderPaths(tree: ScenarioTree): Set<string> {
  const paths = new Set<string>();

  const collect = (folders: ScenarioTreeFolder[]) => {
    for (const folder of folders) {
      paths.add(folder.path);
      collect(folder.folders);
    }
  };

  collect(tree.folders);
  return paths;
}

export function getDescendantFolderIds(folders: ScenarioFolder[], folderId: string): Set<string> {
  const descendants = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (descendants.has(folder.parentId) && !descendants.has(folder.id)) {
        descendants.add(folder.id);
        changed = true;
      }
    }
  }
  return descendants;
}

function compareScenarios(left: ScenarioDescriptor, right: ScenarioDescriptor): number {
  return (
    left.displayName.localeCompare(right.displayName) ||
    left.relativePath.localeCompare(right.relativePath)
  );
}

function compareFolders(left: ScenarioTreeFolder, right: ScenarioTreeFolder): number {
  return left.name.localeCompare(right.name) || left.path.localeCompare(right.path);
}

function matches(descriptor: ScenarioDescriptor, filter: string): boolean {
  if (filter === '') return true;
  const searchable = `${descriptor.displayName} ${descriptor.relativePath}`.toLocaleLowerCase();
  return searchable.includes(filter);
}

export function buildScenarioTree(
  descriptors: ScenarioDescriptor[],
  searchQuery = '',
  persistedFolders: ScenarioFolder[] = [],
): ScenarioTree {
  const filter = searchQuery.trim().toLocaleLowerCase();
  const root: ScenarioTree = { folders: [], scenarios: [] };

  if (persistedFolders.length > 0) {
    const folderById = new Map<string, ScenarioTreeFolder>();
    for (const folder of persistedFolders) {
      folderById.set(folder.id, {
        id: folder.id,
        path: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        siblingOrder: folder.siblingOrder,
        folders: [],
        scenarios: [],
      });
    }
    for (const folder of persistedFolders) {
      const current = folderById.get(folder.id);
      if (current === undefined) continue;
      const parent = folder.parentId === '' ? undefined : folderById.get(folder.parentId);
      (parent?.folders ?? root.folders).push(current);
    }
    for (const descriptor of descriptors) {
      if (!matches(descriptor, filter)) continue;
      const folder = folderById.get(descriptor.folderId ?? '');
      (folder?.scenarios ?? root.scenarios).push(descriptor);
    }
    const sortPersisted = (folder: ScenarioTreeFolder) => {
      folder.folders.sort(
        (left, right) =>
          left.siblingOrder - right.siblingOrder || left.name.localeCompare(right.name),
      );
      folder.scenarios.sort(
        (left, right) =>
          (left.siblingOrder ?? 0) - (right.siblingOrder ?? 0) || compareScenarios(left, right),
      );
      folder.folders.forEach(sortPersisted);
    };
    root.folders.sort(
      (left, right) =>
        left.siblingOrder - right.siblingOrder || left.name.localeCompare(right.name),
    );
    root.scenarios.sort(
      (left, right) =>
        (left.siblingOrder ?? 0) - (right.siblingOrder ?? 0) || compareScenarios(left, right),
    );
    root.folders.forEach(sortPersisted);
    if (filter !== '') {
      const hasMatches = (folder: ScenarioTreeFolder): boolean => {
        folder.folders = folder.folders.filter(hasMatches);
        return folder.scenarios.length > 0 || folder.folders.length > 0;
      };
      root.folders = root.folders.filter(hasMatches);
    }
    return root;
  }

  for (const descriptor of descriptors) {
    if (!matches(descriptor, filter)) continue;

    const folderParts = descriptor.folderPath === '' ? [] : descriptor.folderPath.split('/');
    if (folderParts.length === 0) {
      root.scenarios.push(descriptor);
      continue;
    }

    let folders = root.folders;
    let currentPath = '';
    let currentFolder: ScenarioTreeFolder | undefined;
    for (const part of folderParts) {
      currentPath = currentPath === '' ? part : `${currentPath}/${part}`;
      currentFolder = folders.find((folder) => folder.path === currentPath);
      if (currentFolder === undefined) {
        currentFolder = {
          id: currentPath,
          path: currentPath,
          name: part,
          parentId: currentPath.includes('/')
            ? currentPath.slice(0, currentPath.lastIndexOf('/'))
            : '',
          siblingOrder: 0,
          folders: [],
          scenarios: [],
        };
        folders.push(currentFolder);
      }
      folders = currentFolder.folders;
    }
    currentFolder?.scenarios.push(descriptor);
  }

  const sortFolder = (folder: ScenarioTreeFolder) => {
    folder.folders.sort(compareFolders);
    folder.scenarios.sort(compareScenarios);
    folder.folders.forEach(sortFolder);
  };
  root.folders.sort(compareFolders);
  root.scenarios.sort(compareScenarios);
  root.folders.forEach(sortFolder);
  return root;
}
