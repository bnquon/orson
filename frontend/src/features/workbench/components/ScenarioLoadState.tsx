import { NavArrowDown, WarningCircle, Xmark } from 'iconoir-react';
import { useState } from 'react';
import { LoadingDots } from '../../../components/LoadingDots';
import type { ApiError } from '../../../api/result';
import type { ScenarioDescriptor, ScenarioDiagnostic, ScenarioWarning } from '../types';
import '../styles/scenario.css';

interface ScenarioLoadStateProps {
  status: 'loading' | 'failed' | 'empty';
  error?: ApiError | null;
  descriptors?: ScenarioDescriptor[];
  onRetry?: () => void;
}

export function ScenarioLoadState({
  status,
  error,
  descriptors = [],
  onRetry,
}: ScenarioLoadStateProps) {
  if (status === 'loading') {
    return (
      <main className="scenario-load-state" role="status" aria-busy="true">
        <LoadingDots size="setup" />
        <strong>Loading scenario…</strong>
      </main>
    );
  }

  const empty = status === 'empty';
  return (
    <main className="scenario-load-state scenario-load-state--failed" role="alert">
      <WarningCircle width={20} height={20} />
      <div>
        <strong>
          {error?.message ??
            (empty
              ? 'No valid bundled scenarios are available.'
              : 'The scenario catalog could not be loaded.')}
        </strong>
        <p>{empty ? 'Review the bundled YAML diagnostics below.' : 'Scenario discovery failed.'}</p>
        {error?.details ? <pre>{error.details}</pre> : null}
        {empty ? (
          <div className="scenario-load-state__catalog-diagnostics">
            {descriptors.map((descriptor) => (
              <ScenarioDescriptorDiagnostics descriptor={descriptor} key={descriptor.id} />
            ))}
          </div>
        ) : null}
        {error?.retryable && onRetry ? (
          <button type="button" onClick={onRetry}>
            Retry loading scenario
          </button>
        ) : null}
      </div>
    </main>
  );
}

function sourceLocation(diagnostic: ScenarioDiagnostic): string {
  return `${diagnostic.sourceFilename}${diagnostic.line > 0 ? `:${diagnostic.line}` : ''}${diagnostic.column > 0 ? `:${diagnostic.column}` : ''}`;
}

function diagnosticKey(diagnostic: ScenarioDiagnostic): string {
  return [
    diagnostic.code,
    diagnostic.sourceFilename,
    diagnostic.line,
    diagnostic.column,
    diagnostic.path,
    diagnostic.message,
    diagnostic.details,
  ].join('\u0000');
}

function warningKey(warning: ScenarioWarning): string {
  return [warning.code, warning.sourceFilename, warning.line, warning.column, warning.message].join(
    '\u0000',
  );
}

function ScenarioDescriptorDiagnostics({ descriptor }: { descriptor: ScenarioDescriptor }) {
  return (
    <section
      className="scenario-selection-diagnostics"
      aria-label={`${descriptor.displayName} diagnostics`}
    >
      <strong>{descriptor.displayName}</strong>
      {descriptor.diagnostics.length === 0 ? (
        <p>{descriptor.sourceFilename} has no blocking diagnostics.</p>
      ) : (
        <DiagnosticList diagnostics={descriptor.diagnostics} />
      )}
    </section>
  );
}

function DiagnosticList({ diagnostics }: { diagnostics: ScenarioDiagnostic[] }) {
  return (
    <ul>
      {diagnostics.map((diagnostic) => (
        <li key={diagnosticKey(diagnostic)}>
          <span>{diagnostic.message}</span>
          <code>{sourceLocation(diagnostic)}</code>
          {diagnostic.path ? <small>{diagnostic.path}</small> : null}
          {diagnostic.details && diagnostic.details !== diagnostic.message ? (
            <details>
              <summary>Technical details</summary>
              <pre>{diagnostic.details}</pre>
            </details>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

interface ScenarioSelectionLoadErrorProps {
  descriptor: ScenarioDescriptor | null;
  error: ApiError;
  diagnostics: ScenarioDiagnostic[];
  onRetry?: () => void;
}

export function ScenarioSelectionLoadError({
  descriptor,
  error,
  diagnostics,
  onRetry,
}: ScenarioSelectionLoadErrorProps) {
  const sourceFilename = descriptor?.sourceFilename ?? 'selected scenario';
  const displayName = sourceFilename.split('/').at(-1) ?? sourceFilename;

  return (
    <section className="scenario-selection-diagnostics" role="alert">
      <strong>{displayName} could not be loaded</strong>
      <p>{error.message}</p>
      <code>{sourceFilename}</code>
      {diagnostics.length > 0 ? (
        <DiagnosticList diagnostics={diagnostics} />
      ) : error.details ? (
        <details>
          <summary>Technical details</summary>
          <pre>{error.details}</pre>
        </details>
      ) : null}
      {error.retryable && onRetry ? (
        <button type="button" onClick={onRetry}>
          Retry loading scenario
        </button>
      ) : null}
    </section>
  );
}

interface ScenarioDiagnosticsProps {
  warnings: ScenarioWarning[];
  sourceFilename: string;
  dismissed: boolean;
  onDismiss: () => void;
}

export function ScenarioDiagnostics({
  warnings,
  sourceFilename,
  dismissed,
  onDismiss,
}: ScenarioDiagnosticsProps) {
  const [expanded, setExpanded] = useState(false);

  if (warnings.length === 0 || dismissed) return null;

  const filename = sourceFilename.split('/').at(-1) ?? sourceFilename;

  return (
    <section className="scenario-diagnostics" aria-label="Scenario warnings">
      <div className="scenario-diagnostics__header">
        <button
          className="scenario-diagnostics__summary"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <WarningCircle width={16} height={16} />
          <span>
            {filename} loaded with {warnings.length} warning{warnings.length === 1 ? '' : 's'}
          </span>
          <NavArrowDown
            className={expanded ? 'scenario-diagnostics__chevron--expanded' : ''}
            width={16}
            height={16}
          />
        </button>
        <button
          className="scenario-diagnostics__dismiss"
          type="button"
          aria-label="Dismiss scenario warnings"
          title="Dismiss scenario warnings"
          onClick={onDismiss}
        >
          <Xmark width={16} height={16} />
        </button>
      </div>
      {expanded ? (
        <ul className="scenario-diagnostics__details">
          {warnings.map((warning) => (
            <li key={warningKey(warning)}>
              <span>{warning.message}</span>
              <code>
                {warning.sourceFilename}
                {warning.line > 0 ? `:${warning.line}` : ''}
                {warning.column > 0 ? `:${warning.column}` : ''}
              </code>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
