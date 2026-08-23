import { CheckCircle } from 'iconoir-react';
import type { ConnectionAttemptState, ConnectionOperation, StartupStatus } from './types';
import { PixelGridLoader } from '../../components/PixelGridLoader';

interface ConnectionStatusProps {
  attempt: ConnectionAttemptState;
  startupStatus: StartupStatus;
  operation: ConnectionOperation;
  hasError: boolean;
}

export function ConnectionStatus({
  attempt,
  startupStatus,
  operation,
  hasError,
}: ConnectionStatusProps) {
  const statusLabel =
    operation === 'connecting'
      ? 'Connecting to Kafka'
      : operation === 'disconnecting'
        ? 'Disconnecting from Kafka'
        : {
            disconnected: 'No active connection',
            connecting: 'Connecting…',
            connected: 'Connected',
            failed: 'Connection failed',
          }[attempt.status];
  const showAttemptStatus = attempt.status !== 'failed' || !hasError;

  return (
    <>
      {startupStatus === 'loading' ? (
        <div
          className="connection-startup-status"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <PixelGridLoader size="status" />
          <span>Checking connection state</span>
        </div>
      ) : null}

      {showAttemptStatus ? (
        <div
          className={`connection-attempt connection-attempt--${attempt.status}`}
          role="status"
          aria-live="polite"
          aria-busy={operation !== 'idle'}
        >
          {operation !== 'idle' ? (
            <PixelGridLoader size="status" />
          ) : attempt.status === 'connected' ? (
            <CheckCircle width={16} height={16} />
          ) : (
            <span className="connection-attempt__dot" aria-hidden="true" />
          )}
          <span>{statusLabel}</span>
        </div>
      ) : null}
    </>
  );
}
