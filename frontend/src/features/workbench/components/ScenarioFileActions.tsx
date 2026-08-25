import { useId, type ReactNode } from 'react';
import { FloppyDisk, FloppyDiskArrowIn } from 'iconoir-react';
import { LoadingDots } from '../../../components/LoadingDots';
import type { ScenarioFileOperation, ScenarioSource } from '../types';

interface ScenarioFileActionsProps {
  source: ScenarioSource;
  sourceFilename: string;
  dirty: boolean;
  saveDisabled: boolean;
  saveAsDisabled: boolean;
  saveDisabledReason: string;
  saveAsDisabledReason: string;
  operation: ScenarioFileOperation;
  onSave: () => void;
  onSaveAs: () => void;
}

function FileAction({
  children,
  disabled,
  disabledReason,
  enabledTitle,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  disabledReason: string;
  enabledTitle: string;
  onClick: () => void;
}) {
  const descriptionId = useId();
  return (
    <span
      className="scenario-disabled-action"
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
  dirty,
  saveDisabled,
  saveAsDisabled,
  saveDisabledReason,
  saveAsDisabledReason,
  operation,
  onSave,
  onSaveAs,
}: ScenarioFileActionsProps) {
  const saveIsDisabled = saveDisabled || !dirty;
  const effectiveSaveDisabledReason = !dirty
    ? 'No changes to save'
    : saveDisabledReason || 'Saving is currently unavailable';
  const effectiveSaveAsDisabledReason = saveAsDisabledReason || 'Save as is currently unavailable';
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
        disabled={saveAsDisabled}
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
    </div>
  );
}
