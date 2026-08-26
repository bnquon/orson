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
} from './types';
import { hasConnectionFieldErrors, validateConnectionValues } from './validation';
import './styles/connection.css';

interface ConnectionFormProps {
  activeConnection: api.ConnectionInfo | null;
  initialAttempt: ConnectionAttemptState;
  initialValues: ConnectionFormValues;
  error?: ApiError | null;
  operation: ConnectionOperation;
  formId: string;
  showActions?: boolean;
  onConnect: (values: ConnectionFormValues) => void;
  onDisconnect: () => void;
  onClearErrors: () => void;
}

export function ConnectionForm({
  activeConnection,
  initialAttempt,
  initialValues,
  error = null,
  operation,
  formId,
  showActions = true,
  onConnect,
  onDisconnect,
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
      <ConnectionStatus attempt={initialAttempt} operation={operation} hasError={error !== null} />
      <ConnectionError fieldErrors={fieldErrors} error={error} />
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
