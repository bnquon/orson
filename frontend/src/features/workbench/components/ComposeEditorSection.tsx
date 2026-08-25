import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
} from 'react';
import {
  Check,
  CheckCircle,
  CodeBrackets,
  Copy,
  InfoCircle,
  Lock,
  Plus,
  Trash,
  WarningCircle,
} from 'iconoir-react';
import type {
  ComposeEditorTab,
  ScenarioDraft,
  TouchedState,
  ValidatableField,
  ValidationResult,
} from '../types';
import { Tooltip } from '../../../components/Tooltip';
import { focusControl } from './focusControl';
import {
  formatJsonPayload,
  indentJsonSelection,
  insertJsonNewline,
  outdentJsonSelection,
} from '../jsonEditing';
import { handleTabListKeyDown } from './tabKeyboard';

interface ComposeEditorSectionProps {
  draft: ScenarioDraft;
  setDraft: Dispatch<SetStateAction<ScenarioDraft>>;
  activeTab: ComposeEditorTab;
  onTabChange: (tab: ComposeEditorTab) => void;
  touched: TouchedState;
  validation: ValidationResult;
  jsonError: string | null;
  jsonValidationPending: boolean;
  onTouchField: (field: ValidatableField) => void;
  onTouchHeader: (headerId: string) => void;
}

export function ComposeEditorSection({
  draft,
  setDraft,
  activeTab,
  onTabChange,
  touched,
  validation,
  jsonError,
  jsonValidationPending,
  onTouchField,
  onTouchHeader,
}: ComposeEditorSectionProps) {
  const showFieldError = (field: ValidatableField) => touched.fields[field] === true;
  const touchedHeaderIds = new Set(touched.headerIds);
  const [copiedPayload, setCopiedPayload] = useState<string | null>(null);
  const copyResetTimeout = useRef<number | null>(null);
  const isPayloadCopied = copiedPayload === draft.payload;

  useEffect(
    () => () => {
      if (copyResetTimeout.current !== null) {
        window.clearTimeout(copyResetTimeout.current);
      }
    },
    [],
  );

  const addHeader = () => {
    const id = crypto.randomUUID();
    setDraft((current) => ({
      ...current,
      headers: [...current.headers, { id, name: '', value: '', protected: false }],
    }));
    focusControl(`header-name-${id}`);
  };

  const removeHeader = (headerId: string) => {
    const editableHeaders = draft.headers.filter((header) => !header.protected);
    const index = editableHeaders.findIndex((header) => header.id === headerId);
    const remainingEditable = editableHeaders.filter((header) => header.id !== headerId);
    const nextHeader = remainingEditable[Math.min(index, remainingEditable.length - 1)];
    setDraft((current) => ({
      ...current,
      headers: current.headers.filter((header) => header.id !== headerId),
    }));
    focusControl(nextHeader === undefined ? 'compose-add-header' : `header-name-${nextHeader.id}`);
  };

  const applyPayloadEdit = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    edit: { value: string; selectionStart: number; selectionEnd: number },
  ) => {
    const textarea = event.currentTarget;
    setDraft((current) => ({ ...current, payload: edit.value }));
    window.requestAnimationFrame(() => {
      textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  };

  const handlePayloadKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const { selectionStart, selectionEnd, value } = event.currentTarget;

    if (event.key === 'Tab') {
      event.preventDefault();
      const edit = event.shiftKey
        ? outdentJsonSelection(value, selectionStart, selectionEnd)
        : indentJsonSelection(value, selectionStart, selectionEnd);
      applyPayloadEdit(event, edit);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      applyPayloadEdit(event, insertJsonNewline(value, selectionStart, selectionEnd));
    }
  };

  const handleFormatJson = () => {
    const formatted = formatJsonPayload(draft.payload);
    if (formatted === null) return;
    setDraft((current) => ({ ...current, payload: formatted }));
  };

  const handleCopyPayload = async () => {
    try {
      await navigator.clipboard.writeText(draft.payload);
      setCopiedPayload(draft.payload);

      if (copyResetTimeout.current !== null) {
        window.clearTimeout(copyResetTimeout.current);
      }

      copyResetTimeout.current = window.setTimeout(() => {
        setCopiedPayload(null);
        copyResetTimeout.current = null;
      }, 1600);
    } catch {
      setCopiedPayload(null);
    }
  };

  return (
    <section className="compose-editor">
      <div className="compose-editor__tabs" role="tablist" aria-label="Message editor">
        <button
          className={
            activeTab === 'headers'
              ? 'compose-editor__tab compose-editor__tab--active'
              : 'compose-editor__tab'
          }
          id="compose-editor-tab-headers"
          type="button"
          role="tab"
          tabIndex={activeTab === 'headers' ? 0 : -1}
          aria-selected={activeTab === 'headers'}
          aria-controls="compose-editor-panel"
          onClick={() => onTabChange('headers')}
          onKeyDown={handleTabListKeyDown}
        >
          Headers <span className="compose-editor__count">{draft.headers.length}</span>
        </button>
        <button
          className={
            activeTab === 'payload'
              ? 'compose-editor__tab compose-editor__tab--active'
              : 'compose-editor__tab'
          }
          id="compose-editor-tab-payload"
          type="button"
          role="tab"
          tabIndex={activeTab === 'payload' ? 0 : -1}
          aria-selected={activeTab === 'payload'}
          aria-controls="compose-editor-panel"
          onClick={() => onTabChange('payload')}
          onKeyDown={handleTabListKeyDown}
        >
          JSON payload
          {jsonValidationPending ? (
            <span>Checking</span>
          ) : jsonError === null ? (
            <CheckCircle className="compose-editor__valid" />
          ) : (
            <WarningCircle className="compose-editor__invalid" />
          )}
        </button>
      </div>

      {activeTab === 'headers' ? (
        <div
          className="headers-editor workbench-scroll-region"
          id="compose-editor-panel"
          role="tabpanel"
          aria-labelledby="compose-editor-tab-headers"
        >
          <div className="headers-editor__rows">
            <div className="headers-editor__section-label">Managed by Orson</div>
            <div className="header-row header-row--managed">
              <code className="header-row__managed-name">{draft.correlationHeader}</code>
              <span className="header-row__managed-value">Generated automatically per run</span>
              <Tooltip
                label="Correlation ID managed by Orson"
                content="Orson generates a new correlation ID for each run and adds it automatically so downstream events can be matched to this flow."
              >
                <Lock width={16} height={16} aria-hidden="true" />
              </Tooltip>
            </div>
            <div className="headers-editor__section-header">
              <div className="headers-editor__section-label">Custom headers</div>
              <button
                className="compose-secondary-button"
                id="compose-add-header"
                type="button"
                onClick={addHeader}
              >
                <Plus /> Add header
              </button>
            </div>
            {draft.headers.map((header) => {
              if (header.protected) {
                return (
                  <div className="header-row header-row--protected" key={header.id}>
                    <code>
                      <Lock width={16} height={16} /> {header.name}
                    </code>
                    <span>{header.value}</span>
                    <span className="header-row__system">System</span>
                  </div>
                );
              }

              const showError = touchedHeaderIds.has(header.id);
              const error = validation.headerErrors[header.id];
              return (
                <div className="header-row-wrap" key={header.id}>
                  <div className="header-row">
                    <input
                      id={`header-name-${header.id}`}
                      className={showError && error !== undefined ? 'compose-control--invalid' : ''}
                      value={header.name}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          headers: current.headers.map((item) =>
                            item.id === header.id ? { ...item, name: event.target.value } : item,
                          ),
                        }))
                      }
                      onBlur={() => onTouchHeader(header.id)}
                      aria-label="Header name"
                      aria-invalid={showError && error !== undefined}
                      aria-describedby={`header-error-${header.id}`}
                      autoComplete="off"
                    />
                    <input
                      value={header.value}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          headers: current.headers.map((item) =>
                            item.id === header.id ? { ...item, value: event.target.value } : item,
                          ),
                        }))
                      }
                      aria-label={`Value for ${header.name || 'header'}`}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${header.name || 'header'}`}
                      title="Remove header"
                      onClick={() => removeHeader(header.id)}
                    >
                      <Trash width={16} height={16} />
                    </button>
                  </div>
                  <span className="compose-error-slot" id={`header-error-${header.id}`}>
                    {showError ? error : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className="payload-editor"
          id="compose-editor-panel"
          role="tabpanel"
          aria-labelledby="compose-editor-tab-payload"
        >
          <div className="payload-editor__actions">
            <button
              className="payload-editor__action"
              type="button"
              aria-label="Format JSON"
              title="Format JSON"
              onClick={handleFormatJson}
              disabled={jsonValidationPending || jsonError !== null}
            >
              <CodeBrackets width={16} height={16} aria-hidden="true" />
            </button>
            <button
              className={
                isPayloadCopied
                  ? 'payload-editor__action payload-editor__action--copied'
                  : 'payload-editor__action'
              }
              type="button"
              aria-label={isPayloadCopied ? 'JSON copied' : 'Copy JSON'}
              title={isPayloadCopied ? 'Copied' : 'Copy JSON'}
              onClick={() => void handleCopyPayload()}
            >
              {isPayloadCopied ? (
                <Check width={16} height={16} aria-hidden="true" />
              ) : (
                <Copy width={16} height={16} aria-hidden="true" />
              )}
            </button>
          </div>
          <textarea
            id="compose-payload"
            className={`workbench-scroll-region ${showFieldError('payload') && validation.fieldErrors.payload !== undefined ? 'compose-control--invalid' : ''}`}
            value={draft.payload}
            onChange={(event) =>
              setDraft((current) => ({ ...current, payload: event.target.value }))
            }
            onKeyDown={handlePayloadKeyDown}
            onBlur={() => onTouchField('payload')}
            aria-label="JSON payload"
            aria-invalid={showFieldError('payload') && validation.fieldErrors.payload !== undefined}
            aria-describedby="compose-payload-status"
            spellCheck={false}
          />
          <div className="payload-editor__status" id="compose-payload-status" aria-live="polite">
            {jsonValidationPending ? (
              <span>
                <InfoCircle /> Checking JSON…
              </span>
            ) : jsonError === null ? (
              <span className="payload-editor__status--valid">
                <CheckCircle /> Valid JSON
              </span>
            ) : (
              <span className={showFieldError('payload') ? 'payload-editor__status--invalid' : ''}>
                <WarningCircle /> {jsonError}
              </span>
            )}
            <span>{draft.payload.length} characters</span>
          </div>
        </div>
      )}
    </section>
  );
}
