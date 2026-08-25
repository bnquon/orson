import { useState, type SubmitEvent } from 'react';
import type { api } from '../../../wailsjs/go/models';
import type { ApiError } from '../../api/result';
import { ConnectionActions } from './ConnectionActions';
import { ConnectionError } from './ConnectionError';
import { ConnectionFields } from './ConnectionFields';
import { ConnectionStatus } from './ConnectionStatus';
import type {
  ConnectionAttemptState,
  ConnectionFieldErrors,
  ConnectionFormValues,
  ConnectionOperation,
  StartupStatus,
} from './types';
import { hasConnectionFieldErrors, validateConnectionValues } from './validation';
import './styles/connection.css';

interface ConnectionFormProps {
  activeConnection: api.ConnectionInfo | null;
  initialAttempt: ConnectionAttemptState;
  initialValues: ConnectionFormValues;
  startupStatus?: StartupStatus;
  error?: ApiError | null;
  operation: ConnectionOperation;
  formId: string;
  showActions?: boolean;
  onConnect: (values: ConnectionFormValues) => void;
  onDisconnect: () => void;
  onRetryStartup?: () => void;
  onClearErrors: () => void;
}

export function ConnectionForm({
  activeConnection,
  initialAttempt,
  initialValues,
  startupStatus = 'ready',
  error = null,
  operation,
  formId,
  showActions = true,
  onConnect,
  onDisconnect,
  onRetryStartup,
  onClearErrors,
}: ConnectionFormProps) {
  const [values, setValues] = useState<ConnectionFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<ConnectionFieldErrors>({});
  const isSubmitting = operation !== 'idle';

  const clearFieldError = (field: string) => {
    setFieldErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field as keyof ConnectionFieldErrors];
      return next;
    });
    onClearErrors();
  };

  const updateValue = <K extends keyof ConnectionFormValues>(
    field: K,
    value: ConnectionFormValues[K],
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
  };

  const updateBroker = (index: number, value: string) => {
    setValues((current) => ({
      ...current,
      brokers: current.brokers.map((broker, brokerIndex) =>
        brokerIndex === index ? { ...broker, address: value } : broker,
      ),
    }));
    clearFieldError(`brokers.${index}`);
  };

  const addBroker = () => {
    setValues((current) => ({
      ...current,
      brokers: [...current.brokers, { id: crypto.randomUUID(), address: '' }],
    }));
    onClearErrors();
  };

  const removeBroker = (index: number) => {
    if (values.brokers.length === 1) return;
    setValues((current) => ({
      ...current,
      brokers: current.brokers.filter((_, brokerIndex) => brokerIndex !== index),
    }));
    onClearErrors();
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const nextErrors = validateConnectionValues(values);
    setFieldErrors(nextErrors);
    onClearErrors();

    if (hasConnectionFieldErrors(nextErrors)) return;

    onConnect({
      name: values.name.trim(),
      brokers: values.brokers.map((broker) => ({
        ...broker,
        address: broker.address.trim(),
      })),
      clientId: values.clientId.trim(),
      dialTimeoutSeconds: values.dialTimeoutSeconds.trim(),
    });
  };

  return (
    <form id={formId} className="connection-form" onSubmit={handleSubmit} noValidate>
      <ConnectionStatus
        attempt={initialAttempt}
        startupStatus={startupStatus}
        operation={operation}
        hasError={error !== null}
      />
      <ConnectionError
        fieldErrors={fieldErrors}
        error={error}
        startupStatus={startupStatus}
        isSubmitting={isSubmitting}
        onRetryStartup={onRetryStartup}
      />
      <ConnectionFields
        values={values}
        fieldErrors={fieldErrors}
        isSubmitting={isSubmitting}
        autoFocus={activeConnection === null}
        onUpdateValue={updateValue}
        onUpdateBroker={updateBroker}
        onAddBroker={addBroker}
        onRemoveBroker={removeBroker}
      />

      {/* TODO: [Database] Persist connection profiles when saved connections are introduced. */}
      {/* TODO: [Persistence] Keep session-only behavior until SQLite-backed workspaces are implemented. */}
      {/* TODO: [Keychain] Store credentials once authenticated Kafka connections are supported. */}
      {showActions ? (
        <ConnectionActions
          activeConnection={activeConnection}
          formId={formId}
          operation={operation}
          onDisconnect={onDisconnect}
        />
      ) : null}
    </form>
  );
}
