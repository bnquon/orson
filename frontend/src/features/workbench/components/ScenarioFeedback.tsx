import type { ScenarioDiagnostic, ScenarioWarning } from '../types';

function diagnosticKey(diagnostic: ScenarioDiagnostic): string {
  return [
    diagnostic.code,
    diagnostic.path,
    diagnostic.sourceFilename,
    diagnostic.line,
    diagnostic.column,
    diagnostic.message,
    diagnostic.details,
  ].join('\u0000');
}

export function scenarioWarningKey(warning: ScenarioWarning): string {
  return [
    warning.code,
    warning.path,
    warning.sourceFilename,
    warning.line,
    warning.column,
    warning.message,
  ].join('\u0000');
}

function diagnosticLocation(diagnostic: ScenarioDiagnostic): string {
  return [
    diagnostic.sourceFilename,
    diagnostic.line > 0 ? String(diagnostic.line) : '',
    diagnostic.column > 0 ? String(diagnostic.column) : '',
  ]
    .filter(Boolean)
    .join(':');
}

export function ScenarioDiagnosticList({ diagnostics }: { diagnostics: ScenarioDiagnostic[] }) {
  return (
    <ul>
      {diagnostics.map((diagnostic) => (
        <li key={diagnosticKey(diagnostic)}>
          <span>{diagnostic.message}</span>
          <code>{diagnosticLocation(diagnostic)}</code>
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
