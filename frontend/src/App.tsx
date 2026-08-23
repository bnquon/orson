import { useEffect, useState } from 'react';
import { IconoirProvider } from 'iconoir-react';
import type { api } from '../wailsjs/go/models';
import { getConnectionStatus } from './api/connection';
import { ConnectionDialog } from './features/connection/ConnectionDialog';
import { ConnectionPage } from './features/connection/ConnectionPage';
import type { ConnectionAttemptState, ConnectionAttemptStatus } from './features/connection/types';
import { WorkbenchPage } from './features/workbench/WorkbenchPage';
import type { KafkaConnection } from './features/workbench/types';

const initialAttempt: ConnectionAttemptState = {
  status: 'disconnected',
  error: null,
};

function toConnection(info: api.ConnectionInfo): KafkaConnection {
  return {
    name: info.name,
    brokers: [...info.brokers],
    clientId: info.clientId,
    dialTimeoutSeconds: info.dialTimeoutSeconds,
    status: 'connected',
  };
}

function toAttempt(state: api.ConnectionState): ConnectionAttemptState {
  const statuses: ConnectionAttemptStatus[] = ['disconnected', 'connecting', 'connected', 'failed'];
  const status = statuses.includes(state.latestAttempt.status as ConnectionAttemptStatus)
    ? (state.latestAttempt.status as ConnectionAttemptStatus)
    : 'disconnected';

  return {
    status,
    error: state.latestAttempt.error ?? null,
  };
}

function App() {
  const [activeConnection, setActiveConnection] = useState<KafkaConnection | null>(null);
  const [attempt, setAttempt] = useState<ConnectionAttemptState>(initialAttempt);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    void getConnectionStatus().then((result) => {
      if (!mounted || !result.ok || result.data === undefined) {
        if (mounted && !result.ok) {
          setAttempt((current) =>
            current.status === 'disconnected' ? { status: 'failed', error: result.error } : current,
          );
        }
        return;
      }

      setAttempt((current) =>
        current.status === 'disconnected' ? toAttempt(result.data) : current,
      );
      if (result.data.active !== undefined) {
        setActiveConnection((current) => current ?? toConnection(result.data.active!));
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const handleConnected = (state: api.ConnectionState) => {
    if (state.active === undefined) return;
    setActiveConnection(toConnection(state.active));
    setAttempt(toAttempt(state));
    setConnectionDialogOpen(false);
  };

  const handleDisconnected = () => {
    setActiveConnection(null);
    setAttempt({ status: 'disconnected', error: null });
    setConnectionDialogOpen(false);
  };

  const handleAttemptChange = (next: ConnectionAttemptState) => {
    setAttempt(next);
  };

  return (
    <IconoirProvider iconProps={{ width: 18, height: 18, strokeWidth: 1.5 }}>
      {activeConnection === null ? (
        <ConnectionPage
          attempt={attempt}
          onAttemptChange={handleAttemptChange}
          onConnected={handleConnected}
          onDisconnected={handleDisconnected}
        />
      ) : (
        <>
          <WorkbenchPage
            connection={activeConnection}
            connectionDialogOpen={connectionDialogOpen}
            onConnectionToggle={() => setConnectionDialogOpen((open) => !open)}
          />
          <ConnectionDialog
            open={connectionDialogOpen}
            activeConnection={activeConnection}
            attempt={attempt}
            onAttemptChange={handleAttemptChange}
            onConnected={handleConnected}
            onDisconnected={handleDisconnected}
            onClose={() => setConnectionDialogOpen(false)}
          />
        </>
      )}
    </IconoirProvider>
  );
}

export default App;
