import { useMemo } from 'react';
import type { api } from '../../../wailsjs/go/models';
import type { ApiError } from '../../api/result';
import { Modal } from '../../components/Modal';
import type { ConnectionAttemptState, ConnectionFormValues, ConnectionOperation } from './types';
import { ConnectionActions } from './ConnectionActions';
import { ConnectionForm } from './ConnectionForm';
import './styles/connection.css';

interface ConnectionDialogProps {
  open: boolean;
  activeConnection: api.ConnectionInfo;
  attempt: ConnectionAttemptState;
  operation: ConnectionOperation;
  error: ApiError | null;
  onConnect: (values: ConnectionFormValues) => void;
  onDisconnect: () => void;
  onClearErrors: () => void;
  onClose: () => void;
}

export function ConnectionDialog({
  open,
  activeConnection,
  attempt,
  operation,
  error,
  onConnect,
  onDisconnect,
  onClearErrors,
  onClose,
}: ConnectionDialogProps) {
  const initialValues = useMemo<ConnectionFormValues>(
    () => ({
      name: activeConnection.name,
      brokers: activeConnection.brokers.map((address) => ({
        id: crypto.randomUUID(),
        address,
      })),
      clientId: activeConnection.clientId,
      dialTimeoutSeconds: String(activeConnection.dialTimeoutSeconds),
    }),
    [activeConnection],
  );

  if (!open) return null;

  return (
    <Modal
      open
      title="Kafka connection"
      description="Update the active session connection without leaving the workbench."
      closeDisabled={operation !== 'idle'}
      onClose={onClose}
      footer={
        <ConnectionActions
          activeConnection={activeConnection}
          formId="connection-dialog-form"
          operation={operation}
          onDisconnect={onDisconnect}
        />
      }
    >
      <ConnectionForm
        activeConnection={activeConnection}
        initialAttempt={attempt}
        initialValues={initialValues}
        error={error}
        operation={operation}
        formId="connection-dialog-form"
        showActions={false}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onClearErrors={onClearErrors}
      />
    </Modal>
  );
}
