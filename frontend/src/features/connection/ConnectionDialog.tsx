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
  activeConnection: api.ConnectionInfo | null;
  rememberedConnection: api.ConnectionInfo | null;
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
  rememberedConnection,
  attempt,
  operation,
  error,
  onConnect,
  onDisconnect,
  onClearErrors,
  onClose,
}: ConnectionDialogProps) {
  const initialValues = useMemo<ConnectionFormValues>(() => {
    const source = activeConnection ?? rememberedConnection;
    return {
      name: source?.name ?? '',
      brokers: (source?.brokers.length ? source.brokers : ['']).map((address) => ({
        id: crypto.randomUUID(),
        address,
      })),
      clientId: source?.clientId ?? 'orson',
      dialTimeoutSeconds: String(source?.dialTimeoutSeconds ?? 5),
    };
  }, [activeConnection, rememberedConnection]);

  if (!open) return null;

  return (
    <Modal
      open
      title="Kafka connection"
      description="Connection settings are remembered for this workspace after a successful connection."
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
        key={`${initialValues.name}:${initialValues.brokers.map((broker) => broker.address).join(',')}:${initialValues.clientId}:${initialValues.dialTimeoutSeconds}`}
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
