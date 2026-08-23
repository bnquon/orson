import { useMemo, useState } from 'react';
import type { api } from '../../../wailsjs/go/models';
import { Modal } from '../../components/Modal';
import type { KafkaConnection } from '../workbench/types';
import { ConnectionForm } from './ConnectionForm';
import type { ConnectionAttemptState, ConnectionFormValues } from './types';

interface ConnectionDialogProps {
  open: boolean;
  activeConnection: KafkaConnection;
  attempt: ConnectionAttemptState;
  onAttemptChange: (attempt: ConnectionAttemptState) => void;
  onConnected: (state: api.ConnectionState) => void;
  onDisconnected: () => void;
  onClose: () => void;
}

export function ConnectionDialog({
  open,
  activeConnection,
  attempt,
  onAttemptChange,
  onConnected,
  onDisconnected,
  onClose,
}: ConnectionDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initialValues = useMemo<ConnectionFormValues>(
    () => ({
      name: activeConnection.name,
      brokers: [...activeConnection.brokers],
      clientId: activeConnection.clientId,
      dialTimeoutSeconds: String(activeConnection.dialTimeoutSeconds),
    }),
    [activeConnection],
  );

  return (
    <Modal
      open={open}
      title="Kafka connection"
      description="Update the active session connection without leaving the workbench."
      closeDisabled={isSubmitting}
      onClose={onClose}
    >
      <ConnectionForm
        activeConnection={activeConnection}
        initialAttempt={attempt}
        initialValues={initialValues}
        onAttemptChange={onAttemptChange}
        onConnected={onConnected}
        onDisconnected={onDisconnected}
        onSubmittingChange={setIsSubmitting}
      />
    </Modal>
  );
}
