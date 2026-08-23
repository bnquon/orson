import type { api } from '../../../wailsjs/go/models';
import { LoadingDots } from '../../components/LoadingDots';
import type { ConnectionOperation } from './types';

interface ConnectionActionsProps {
  activeConnection: api.ConnectionInfo | null;
  formId: string;
  operation: ConnectionOperation;
  onDisconnect: () => void;
}

export function ConnectionActions({
  activeConnection,
  formId,
  operation,
  onDisconnect,
}: ConnectionActionsProps) {
  const isSubmitting = operation !== 'idle';

  return (
    <div className="connection-actions">
      <span className="connection-actions__hint">
        {activeConnection
          ? 'Changes apply to this session only.'
          : 'Nothing is saved between app launches.'}
      </span>
      {activeConnection ? (
        <button
          className="connection-secondary-button"
          type="button"
          onClick={onDisconnect}
          disabled={isSubmitting}
          aria-busy={operation === 'disconnecting'}
        >
          {operation === 'disconnecting' ? (
            <>
              <LoadingDots size="inline" /> Disconnecting…
            </>
          ) : (
            'Disconnect'
          )}
        </button>
      ) : null}
      <button
        className="connection-primary-button"
        type="submit"
        form={formId}
        disabled={isSubmitting}
        aria-busy={operation === 'connecting'}
      >
        {operation === 'connecting' ? (
          <>
            <LoadingDots size="inline" /> Connecting…
          </>
        ) : (
          'Connect'
        )}
      </button>
    </div>
  );
}
