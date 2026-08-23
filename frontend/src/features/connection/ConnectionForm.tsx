import { useMemo, useState } from 'react';
import { CheckCircle, Plus, Trash, WarningCircle } from 'iconoir-react';
import type { api } from '../../../wailsjs/go/models';
import { connect, disconnect } from '../../api/connection';
import type { ApiError } from '../../api/result';
import type { KafkaConnection } from '../workbench/types';
import type { ConnectionAttemptState, ConnectionFormValues } from './types';
import './styles/connection.css';

interface ConnectionFormProps {
  activeConnection: KafkaConnection | null;
  initialAttempt: ConnectionAttemptState;
  initialValues: ConnectionFormValues;
  onAttemptChange: (attempt: ConnectionAttemptState) => void;
  onConnected: (state: api.ConnectionState) => void;
  onDisconnected: () => void;
  onSubmittingChange?: (isSubmitting: boolean) => void;
}

export function ConnectionForm({
  activeConnection,
  initialAttempt,
  initialValues,
  onAttemptChange,
  onConnected,
  onDisconnected,
  onSubmittingChange = () => {},
}: ConnectionFormProps) {
  const [values, setValues] = useState<ConnectionFormValues>(initialValues);
  const [attempt, setAttempt] = useState<ConnectionAttemptState>(initialAttempt);
  const [requestError, setRequestError] = useState<ApiError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValid = useMemo(() => {
    const timeout = Number(values.dialTimeoutSeconds);
    return (
      values.name.trim().length > 0 &&
      values.brokers.length > 0 &&
      values.brokers.every((broker) => broker.trim().length > 0) &&
      values.clientId.trim().length > 0 &&
      Number.isInteger(timeout) &&
      timeout > 0
    );
  }, [values]);

  const updateAttempt = (next: ConnectionAttemptState) => {
    setAttempt(next);
    onAttemptChange(next);
  };

  const setSubmitting = (next: boolean) => {
    setIsSubmitting(next);
    onSubmittingChange(next);
  };

  const updateValue = <K extends keyof ConnectionFormValues>(
    field: K,
    value: ConnectionFormValues[K],
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    setRequestError(null);
  };

  const updateBroker = (index: number, value: string) => {
    setValues((current) => ({
      ...current,
      brokers: current.brokers.map((broker, brokerIndex) =>
        brokerIndex === index ? value : broker,
      ),
    }));
    setRequestError(null);
  };

  const addBroker = () => {
    setValues((current) => ({
      ...current,
      brokers: [...current.brokers, ''],
    }));
  };

  const removeBroker = (index: number) => {
    if (values.brokers.length === 1) return;
    setValues((current) => ({
      ...current,
      brokers: current.brokers.filter((_, brokerIndex) => brokerIndex !== index),
    }));
  };

  const handleConnect = async () => {
    if (!isValid || isSubmitting) return;

    setRequestError(null);
    updateAttempt({ status: 'connecting', error: null });
    setSubmitting(true);

    const request = {
      name: values.name.trim(),
      brokers: values.brokers.map((broker) => broker.trim()),
      clientId: values.clientId.trim(),
      dialTimeoutSeconds: Number(values.dialTimeoutSeconds),
    };

    const result = await connect(request);
    setSubmitting(false);

    if (!result.ok) {
      updateAttempt({ status: 'failed', error: result.error });
      setRequestError(result.error);
      return;
    }

    if (result.data?.active === undefined) {
      const error: ApiError = {
        code: 'invalid_connection_response',
        message: 'Kafka connected, but Orson received no active connection.',
        retryable: true,
      };
      updateAttempt({ status: 'failed', error });
      setRequestError(error);
      return;
    }

    updateAttempt({ status: 'connected', error: null });
    onConnected(result.data);
  };

  const handleDisconnect = async () => {
    if (isSubmitting) return;

    setRequestError(null);
    setSubmitting(true);
    const result = await disconnect();
    setSubmitting(false);

    if (!result.ok) {
      updateAttempt({ status: 'failed', error: result.error });
      setRequestError(result.error);
      return;
    }

    updateAttempt({ status: 'disconnected', error: null });
    onDisconnected();
  };

  const statusLabel = {
    disconnected: 'No active connection',
    connecting: 'Connecting…',
    connected: 'Connected',
    failed: 'Connection failed',
  }[attempt.status];

  return (
    <form
      className="connection-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleConnect();
      }}
    >
      <div className={`connection-attempt connection-attempt--${attempt.status}`} role="status">
        {attempt.status === 'connected' ? (
          <CheckCircle width={16} height={16} />
        ) : attempt.status === 'failed' ? (
          <WarningCircle width={16} height={16} />
        ) : (
          <span className="connection-attempt__dot" aria-hidden="true" />
        )}
        <span>{statusLabel}</span>
      </div>

      {requestError ? (
        <div className="connection-error" role="alert">
          <WarningCircle width={16} height={16} />
          <div>
            <strong>{requestError.message}</strong>
            {requestError.details ? <p>{requestError.details}</p> : null}
          </div>
        </div>
      ) : null}

      <div className="connection-fields">
        <label className="connection-field connection-field--wide">
          <span className="connection-label">
            Connection name <span>Required</span>
          </span>
          <input
            value={values.name}
            onChange={(event) => updateValue('name', event.target.value)}
            placeholder="Local Kafka"
            autoComplete="off"
            autoFocus={activeConnection === null}
          />
        </label>

        <div className="connection-field connection-field--wide">
          <span className="connection-label">
            Broker addresses <span>At least one required</span>
          </span>
          <div className="connection-brokers">
            {values.brokers.map((broker, index) => (
              <div className="connection-broker-row" key={`broker-${index}`}>
                <input
                  value={broker}
                  onChange={(event) => updateBroker(index, event.target.value)}
                  placeholder="host:port"
                  autoComplete="off"
                  aria-label={`Broker address ${index + 1}`}
                />
                <button
                  className="connection-icon-button"
                  type="button"
                  onClick={() => removeBroker(index)}
                  disabled={values.brokers.length === 1}
                  aria-label={`Remove broker address ${index + 1}`}
                >
                  <Trash width={15} height={15} />
                </button>
              </div>
            ))}
          </div>
          <button className="connection-add-broker" type="button" onClick={addBroker}>
            <Plus width={15} height={15} /> Add broker address
          </button>
          <span className="connection-help">
            Use host:port. Multiple addresses are used as seed brokers.
          </span>
        </div>

        <label className="connection-field">
          <span className="connection-label">
            Client ID <span>Required</span>
          </span>
          <input
            value={values.clientId}
            onChange={(event) => updateValue('clientId', event.target.value)}
            autoComplete="off"
          />
        </label>

        <label className="connection-field">
          <span className="connection-label">
            Dial timeout <span>Seconds</span>
          </span>
          <input
            inputMode="numeric"
            value={values.dialTimeoutSeconds}
            onChange={(event) => updateValue('dialTimeoutSeconds', event.target.value)}
          />
        </label>
      </div>

      {/* TODO: Add TLS, SASL, credentials, and certificate controls after secret handling exists. */}
      {/* TODO: Add saved connections and workspace persistence in a later session-management slice. */}
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
            onClick={() => void handleDisconnect()}
            disabled={isSubmitting}
          >
            Disconnect
          </button>
        ) : null}
        <button
          className="connection-primary-button"
          type="submit"
          disabled={!isValid || isSubmitting}
        >
          {isSubmitting && attempt.status === 'connecting' ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </form>
  );
}
