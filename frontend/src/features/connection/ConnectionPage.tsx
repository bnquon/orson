import { ConnectionForm } from './ConnectionForm';
import type {
  ConnectionAttemptState,
  ConnectionFormValues,
  ConnectionOperation,
  StartupStatus,
} from './types';
import type { ApiError } from '../../api/result';
import orsonIcon from '../../assets/orson-icon.png';
import './styles/connection.css';

interface ConnectionPageProps {
  attempt: ConnectionAttemptState;
  startupStatus: StartupStatus;
  error: ApiError | null;
  operation: ConnectionOperation;
  onConnect: (values: ConnectionFormValues) => void;
  onDisconnect: () => void;
  onRetryStartup: () => void;
  onClearErrors: () => void;
}

export function ConnectionPage({
  attempt,
  startupStatus,
  error,
  operation,
  onConnect,
  onDisconnect,
  onRetryStartup,
  onClearErrors,
}: ConnectionPageProps) {
  return (
    <div className="connection-page">
      <header className="connection-page__header">
        <div className="connection-page__brand">
          <img className="connection-page__mark" src={orsonIcon} alt="" aria-hidden="true" />
          <span className="connection-page__wordmark">orson</span>
          <span className="connection-page__divider">/</span>
          <span>Kafka connection</span>
        </div>
        <span className="connection-page__session">SESSION ONLY</span>
      </header>

      <main className="connection-page__main">
        <section className="connection-card" aria-labelledby="connection-page-title">
          <div className="connection-card__eyebrow">Connection</div>
          <h1 id="connection-page-title">Connect Orson to Kafka</h1>
          <p className="connection-card__intro">
            Add the brokers for this session. Orson will not connect until you choose Connect.
          </p>
          <ConnectionForm
            activeConnection={null}
            initialAttempt={attempt}
            initialValues={{
              name: '',
              brokers: [''],
              clientId: 'orson',
              dialTimeoutSeconds: '5',
            }}
            startupStatus={startupStatus}
            error={error}
            operation={operation}
            formId="connection-setup-form"
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onRetryStartup={onRetryStartup}
            onClearErrors={onClearErrors}
          />
        </section>
      </main>

      <footer className="connection-page__footer">
        <span>PLAINTEXT KAFKA / NO PERSISTENCE</span>
        <span>Connection settings reset when Orson closes</span>
      </footer>
    </div>
  );
}
