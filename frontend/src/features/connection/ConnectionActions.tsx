import type { api } from '../../../wailsjs/go/models';
import { ModalButton } from '../../components/Modal';
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
        Settings are remembered for this workspace after a successful connection.
      </span>
      {activeConnection ? (
        <ModalButton
          tone="secondary"
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
        </ModalButton>
      ) : null}
      <ModalButton
        tone="primary"
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
      </ModalButton>
    </div>
  );
}
