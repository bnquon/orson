import { CheckCircle, NavArrowDown, WarningCircle } from 'iconoir-react';
import { LoadingDots } from '../../../components/LoadingDots';
import type { ScenarioDescriptor } from '../types';
import type { ScenarioRowsProps } from './ScenarioBrowserTree';

export function ScenarioStatusMark({ descriptor }: { descriptor: ScenarioDescriptor }) {
  if (
    descriptor.status === 'invalid' ||
    descriptor.status === 'valid_with_warnings' ||
    (descriptor.source === 'local' && descriptor.localStatus !== 'available')
  ) {
    return (
      <WarningCircle
        className={
          descriptor.source === 'local' && descriptor.localStatus !== 'available'
            ? 'scenario-row__status-icon--error'
            : undefined
        }
        width={14}
        height={14}
        aria-hidden="true"
      />
    );
  }
  return <CheckCircle width={14} height={14} aria-hidden="true" />;
}

export function statusLabel(descriptor: ScenarioDescriptor): string {
  if (descriptor.localStatus === 'changed') return 'File changed outside Orson';
  if (descriptor.localStatus === 'missing') return 'File is missing';
  if (descriptor.localStatus === 'unreadable') return 'File cannot be read';
  if (descriptor.status === 'invalid') return 'Invalid scenario';
  if (descriptor.status === 'valid_with_warnings') {
    return `${descriptor.warnings.length} scenario warning${descriptor.warnings.length === 1 ? '' : 's'}`;
  }
  return 'Valid scenario';
}

export function statusTone(descriptor: ScenarioDescriptor): 'valid' | 'warning' | 'invalid' {
  if (descriptor.status === 'invalid') return 'invalid';
  if (
    descriptor.status === 'valid_with_warnings' ||
    (descriptor.source === 'local' && descriptor.localStatus !== 'available')
  ) {
    return 'warning';
  }
  return 'valid';
}

export function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="scenario-row__folder-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 640"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d={
          open
            ? 'M129.5 464L179.5 304L558.9 304L508.9 464L129.5 464zM320.2 512L509 512C530 512 548.6 498.4 554.8 478.3L604.8 318.3C614.5 287.4 591.4 256 559 256L179.6 256C158.6 256 140 269.6 133.8 289.7L112.2 358.4L112.2 160C112.2 151.2 119.4 144 128.2 144L266.9 144C270.4 144 273.7 145.1 276.5 147.2L314.9 176C328.7 186.4 345.6 192 362.9 192L480.2 192C489 192 496.2 199.2 496.2 208L544.2 208C544.2 172.7 515.5 144 480.2 144L362.9 144C356 144 349.2 141.8 343.7 137.6L305.3 108.8C294.2 100.5 280.8 96 266.9 96L128.2 96C92.9 96 64.2 124.7 64.2 160L64.2 448C64.2 483.3 92.9 512 128.2 512L320.2 512z'
            : 'M128 464L512 464C520.8 464 528 456.8 528 448L528 208C528 199.2 520.8 192 512 192L362.7 192C345.4 192 328.5 186.4 314.7 176L276.3 147.2C273.5 145.1 270.2 144 266.7 144L128 144C119.2 144 112 151.2 112 160L112 448C112 456.8 119.2 464 128 464zM512 512L128 512C92.7 512 64 483.3 64 448L64 160C64 124.7 92.7 96 128 96L266.7 96C280.5 96 294 100.5 305.1 108.8L343.5 137.6C349 141.8 355.8 144 362.7 144L512 144C547.3 144 576 172.7 576 208L576 448C576 483.3 547.3 512 512 512z'
        }
      />
    </svg>
  );
}

export function ScenarioRows({
  folders,
  scenarios,
  expandedFolders,
  selectedScenarioId,
  activeScenarioId,
  scenarioLoadingId,
  selectionDisabled,
  onToggleFolder,
  onSelectScenario,
  folderToggleDisabled = false,
  depth = 0,
  visible = true,
}: ScenarioRowsProps) {
  return (
    <>
      {scenarios.map((descriptor) => {
        const isActive = descriptor.id === activeScenarioId;
        const isSelected = descriptor.id === selectedScenarioId;
        const isSelectedInvalid = isSelected && descriptor.status === 'invalid';
        const disabled = selectionDisabled || scenarioLoadingId !== null;
        return (
          <button
            className={`scenario-row scenario-row--scenario ${isActive ? 'scenario-row--active' : ''} ${isSelected && !isActive ? 'scenario-row--selected' : ''} ${isSelectedInvalid ? 'scenario-row--invalid-selected' : ''}`}
            type="button"
            key={descriptor.id}
            style={{ paddingLeft: `${26 + depth * 14}px` }}
            tabIndex={visible ? undefined : -1}
            aria-current={isActive ? 'page' : undefined}
            aria-label={`${descriptor.displayName}, read-only example, ${statusLabel(descriptor)}${isActive ? ', active' : ''}`}
            title={`${descriptor.relativePath} · Read-only example · ${statusLabel(descriptor)}`}
            disabled={disabled}
            onClick={() => onSelectScenario(descriptor.id)}
          >
            <span className="scenario-row__kind">YAML</span>
            <span className="scenario-row__name">{descriptor.displayName}</span>
            <span
              className={`scenario-row__status scenario-row__status--${statusTone(descriptor)}`}
              aria-label={statusLabel(descriptor)}
            >
              {scenarioLoadingId === descriptor.id ? (
                <LoadingDots size="inline" />
              ) : (
                <ScenarioStatusMark descriptor={descriptor} />
              )}
            </span>
          </button>
        );
      })}
      {folders.map((folder) => {
        const expanded = expandedFolders.has(folder.path);
        const folderId = `scenario-folder-${folder.path.replaceAll('/', '-')}`;
        const descendantsVisible = visible && expanded;
        return (
          <div key={folder.path} className="scenario-folder">
            <button
              className="scenario-row scenario-row--folder"
              type="button"
              disabled={folderToggleDisabled}
              tabIndex={visible ? undefined : -1}
              aria-expanded={expanded}
              aria-controls={folderId}
              style={{ paddingLeft: `${9 + depth * 14}px` }}
              onClick={() => onToggleFolder(folder.path)}
            >
              <span
                className={`scenario-row__chevron ${expanded ? 'scenario-row__chevron--expanded' : ''}`}
                aria-hidden="true"
              >
                <NavArrowDown width={16} height={16} />
              </span>
              <FolderIcon open={expanded} />
              <span className="scenario-row__name">{folder.name}</span>
            </button>
            <div
              className={`scenario-folder-content ${expanded ? 'scenario-folder-content--expanded' : ''}`}
              id={folderId}
              aria-hidden={!expanded}
            >
              <div className="scenario-folder-content__inner">
                <ScenarioRows
                  folders={folder.folders}
                  scenarios={folder.scenarios}
                  expandedFolders={expandedFolders}
                  selectedScenarioId={selectedScenarioId}
                  activeScenarioId={activeScenarioId}
                  scenarioLoadingId={scenarioLoadingId}
                  selectionDisabled={selectionDisabled}
                  onToggleFolder={onToggleFolder}
                  onSelectScenario={onSelectScenario}
                  folderToggleDisabled={folderToggleDisabled}
                  depth={depth + 1}
                  visible={descendantsVisible}
                />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
