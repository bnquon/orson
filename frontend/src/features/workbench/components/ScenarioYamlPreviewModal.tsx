import { useState } from 'react';
import { Check, Copy, WarningCircle } from 'iconoir-react';
import { LoadingDots } from '../../../components/LoadingDots';
import { Modal, ModalActions, ModalButton } from '../../../components/Modal';
import type { ApiError } from '../../../api/result';
import type { ScenarioDiagnostic, ScenarioWarning } from '../types';
import { ScenarioDiagnosticList, scenarioWarningKey } from './ScenarioFeedback';
import '../styles/scenario.css';

export type ScenarioYamlPreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; yaml: string; warnings: ScenarioWarning[] }
  | { status: 'failed'; error: ApiError; diagnostics: ScenarioDiagnostic[] };

interface ScenarioYamlPreviewModalProps {
  open: boolean;
  preview: ScenarioYamlPreviewState;
  onClose: () => void;
}

export function ScenarioYamlPreviewModal({
  open,
  preview,
  onClose,
}: ScenarioYamlPreviewModalProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyYaml = async () => {
    if (preview.status !== 'ready') return;
    try {
      await navigator.clipboard.writeText(preview.yaml);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  return (
    <Modal
      open={open}
      title="Scenario YAML"
      description="Canonical YAML generated from the current structured draft."
      onClose={onClose}
      footer={
        <ModalActions>
          <ModalButton type="button" onClick={onClose}>
            Close
          </ModalButton>
          {preview.status === 'ready' ? (
            <ModalButton
              aria-label="Copy scenario YAML"
              tone="primary"
              type="button"
              onClick={() => void copyYaml()}
            >
              {copyStatus === 'copied' ? (
                <>
                  <Check width={15} height={15} aria-hidden="true" /> Copied
                </>
              ) : copyStatus === 'failed' ? (
                'Copy failed'
              ) : (
                <>
                  <Copy width={15} height={15} aria-hidden="true" /> Copy YAML
                </>
              )}
            </ModalButton>
          ) : null}
        </ModalActions>
      }
    >
      {preview.status === 'idle' || preview.status === 'loading' ? (
        <div className="scenario-yaml-preview__loading" role="status" aria-busy="true">
          <LoadingDots size="inline" /> Generating YAML…
        </div>
      ) : preview.status === 'ready' ? (
        <div className="scenario-yaml-preview">
          {preview.warnings.length > 0 ? (
            <section className="scenario-yaml-preview__warnings" aria-label="Scenario warnings">
              <div>
                <WarningCircle width={16} height={16} aria-hidden="true" />
                <strong>
                  Current draft has {preview.warnings.length} warning
                  {preview.warnings.length === 1 ? '' : 's'}
                </strong>
              </div>
              <ul>
                {preview.warnings.map((warning) => (
                  <li key={scenarioWarningKey(warning)}>
                    <span>{warning.message}</span>
                    {warning.path ? <code>{warning.path}</code> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <pre
            className="scenario-yaml-preview__code workbench-scroll-region"
            aria-label="Canonical scenario YAML"
            tabIndex={0}
          >
            <code>{preview.yaml}</code>
          </pre>
          <span className="sr-only" aria-live="polite">
            {copyStatus === 'copied'
              ? 'YAML copied to clipboard'
              : copyStatus === 'failed'
                ? 'YAML could not be copied'
                : ''}
          </span>
        </div>
      ) : (
        <section className="scenario-yaml-preview__error" role="alert">
          <div>
            <WarningCircle width={18} height={18} aria-hidden="true" />
            <div>
              <strong>YAML preview is unavailable</strong>
              <p>{preview.error.message}</p>
            </div>
          </div>
          {preview.diagnostics.length > 0 ? (
            <ScenarioDiagnosticList diagnostics={preview.diagnostics} />
          ) : preview.error.details ? (
            <details>
              <summary>Technical details</summary>
              <pre>{preview.error.details}</pre>
            </details>
          ) : null}
        </section>
      )}
    </Modal>
  );
}
