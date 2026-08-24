import { NavArrowDown, WarningCircle, Xmark } from 'iconoir-react';
import { useState } from 'react';
import { LoadingDots } from '../../../components/LoadingDots';
import type { ApiError } from '../../../api/result';
import type { ScenarioWarning } from '../types';
import '../styles/scenario.css';

interface ScenarioLoadStateProps {
  status: 'loading' | 'failed';
  error?: ApiError | null;
  onRetry?: () => void;
}

export function ScenarioLoadState({ status, error, onRetry }: ScenarioLoadStateProps) {
  if (status === 'loading') {
    return (
      <main className="scenario-load-state" role="status" aria-busy="true">
        <LoadingDots size="setup" />
        <strong>Loading scenario…</strong>
      </main>
    );
  }

  return (
    <main className="scenario-load-state scenario-load-state--failed" role="alert">
      <WarningCircle width={20} height={20} />
      <div>
        <strong>{error?.message ?? 'The bundled scenario could not be loaded.'}</strong>
        <p>Source: scenarios/order-flow.yaml</p>
        {error?.details ? <pre>{error.details}</pre> : null}
        {error?.retryable && onRetry ? (
          <button type="button" onClick={onRetry}>
            Retry loading scenario
          </button>
        ) : null}
      </div>
    </main>
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
          {warnings.map((warning, index) => (
            <li key={`${warning.code}-${index}`}>
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
