import { useId, type ReactNode } from 'react';
import { CodeBrackets, FloppyDisk, FloppyDiskArrowIn } from 'iconoir-react';
import { LoadingDots } from '../../../components/LoadingDots';
import type { ScenarioFileOperation, ScenarioSource } from '../types';

interface ScenarioFileActionsProps {
  source: Exclude<ScenarioSource, 'unsaved'>;
  sourceFilename: string;
  readOnly?: boolean;
  dirty: boolean;
  saveDisabled: boolean;
  saveAsDisabled: boolean;
  saveDisabledReason: string;
  saveAsDisabledReason: string;
  previewDisabled: boolean;
  previewDisabledReason: string;
  previewing: boolean;
  operation: ScenarioFileOperation;
  onSave: () => void;
  onSaveAs: () => void;
  onPreview: () => void;
}

function FileAction({
  children,
  disabled,
  disabledReason,
  enabledTitle,
  wrapperClassName = '',
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  disabledReason: string;
  enabledTitle: string;
  wrapperClassName?: string;
  onClick: () => void;
}) {
  const descriptionId = useId();
  return (
    <span
      className={`scenario-disabled-action${wrapperClassName ? ` ${wrapperClassName}` : ''}`}
      tabIndex={disabled ? 0 : undefined}
      aria-label={disabled ? disabledReason : undefined}
      title={disabled ? disabledReason : undefined}
    >
      <button
        type="button"
        className="scenario-file-button"
        disabled={disabled}
        aria-describedby={disabled ? descriptionId : undefined}
        title={disabled ? undefined : enabledTitle}
        onClick={onClick}
      >
        {children}
      </button>
      {disabled ? (
        <span className="sr-only" id={descriptionId}>
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
}

export function ScenarioFileActions({
  source,
  sourceFilename,
  readOnly = false,
  dirty,
  saveDisabled,
  saveAsDisabled,
  saveDisabledReason,
  saveAsDisabledReason,
  previewDisabled,
  previewDisabledReason,
  previewing,
  operation,
  onSave,
  onSaveAs,
  onPreview,
}: ScenarioFileActionsProps) {
  const saveIsDisabled = readOnly || saveDisabled || !dirty;
  const effectiveSaveDisabledReason = readOnly
    ? 'Return to the current workspace to edit scenarios'
    : !dirty
      ? 'No changes to save'
      : saveDisabledReason || 'Saving is currently unavailable';
  const effectiveSaveAsDisabledReason = readOnly
    ? 'Return to the current workspace to edit scenarios'
    : saveAsDisabledReason || 'Save as is currently unavailable';
  return (
    <div className={`scenario-file-actions scenario-file-actions--${source}`}>
      {source === 'local' ? (
        <FileAction
          disabled={saveIsDisabled}
          disabledReason={effectiveSaveDisabledReason}
          enabledTitle={`Save ${sourceFilename}`}
          onClick={onSave}
        >
          {operation === 'saving' ? (
            <>
              <LoadingDots size="inline" /> Saving…
            </>
          ) : (
            <>
              <FloppyDisk width={15} height={15} /> Save
            </>
          )}
        </FileAction>
      ) : null}
      <FileAction
        disabled={readOnly || saveAsDisabled}
        disabledReason={effectiveSaveAsDisabledReason}
        enabledTitle="Choose a filename and folder in the native save dialog"
        onClick={onSaveAs}
      >
        {operation === 'saving_as' ? (
          <>
            <LoadingDots size="inline" /> Saving as…
          </>
        ) : (
          <>
            <FloppyDiskArrowIn width={15} height={15} /> Save as
          </>
        )}
      </FileAction>
      {!readOnly ? (
        <FileAction
          disabled={previewDisabled}
          disabledReason={previewDisabledReason || 'YAML preview is currently unavailable'}
          enabledTitle="View canonical YAML"
          wrapperClassName={source === 'local' ? 'scenario-yaml-preview-action' : undefined}
          onClick={onPreview}
        >
          {previewing ? (
            <>
              <LoadingDots size="inline" /> Loading…
            </>
          ) : (
            <>
              <CodeBrackets width={15} height={15} aria-hidden="true" /> View YAML
            </>
          )}
        </FileAction>
      ) : null}
    </div>
  );
}
