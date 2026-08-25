import type { ScenarioDescriptor } from './types';

export interface ScenarioTreeFolder {
  path: string;
  name: string;
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
): ScenarioTree {
  const filter = searchQuery.trim().toLocaleLowerCase();
  const root: ScenarioTree = { folders: [], scenarios: [] };

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
        currentFolder = { path: currentPath, name: part, folders: [], scenarios: [] };
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
