import { CheckCircle } from 'iconoir-react';
import type { ConnectionAttemptState, ConnectionOperation } from './types';
import { PixelGridLoader } from '../../components/PixelGridLoader';

interface ConnectionStatusProps {
  attempt: ConnectionAttemptState;
  operation: ConnectionOperation;
  hasError: boolean;
}

export function ConnectionStatus({ attempt, operation, hasError }: ConnectionStatusProps) {
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
