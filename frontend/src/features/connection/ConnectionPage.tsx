import type { api } from '../../../wailsjs/go/models';
import { ConnectionForm } from './ConnectionForm';
import type { ConnectionAttemptState } from './types';
import './styles/connection.css';

interface ConnectionPageProps {
  attempt: ConnectionAttemptState;
  onAttemptChange: (attempt: ConnectionAttemptState) => void;
  onConnected: (state: api.ConnectionState) => void;
  onDisconnected: () => void;
}

export function ConnectionPage({
  attempt,
  onAttemptChange,
  onConnected,
  onDisconnected,
}: ConnectionPageProps) {
  return (
    <div className="connection-page">
      <header className="connection-page__header">
        <div className="connection-page__brand">
          <span className="connection-page__mark">O</span>
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
            onAttemptChange={onAttemptChange}
            onConnected={onConnected}
            onDisconnected={onDisconnected}
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
