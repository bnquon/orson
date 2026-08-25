import { Plus, Trash } from 'iconoir-react';
import type { ConnectionFieldErrors, ConnectionFormValues } from './types';

interface ConnectionFieldsProps {
  values: ConnectionFormValues;
  fieldErrors: ConnectionFieldErrors;
  isSubmitting: boolean;
  autoFocus: boolean;
  onUpdateValue: <K extends keyof ConnectionFormValues>(
    field: K,
    value: ConnectionFormValues[K],
  ) => void;
  onUpdateBroker: (index: number, value: string) => void;
  onAddBroker: () => void;
  onRemoveBroker: (index: number) => void;
}

export function ConnectionFields({
  values,
  fieldErrors,
  isSubmitting,
  autoFocus,
  onUpdateValue,
  onUpdateBroker,
  onAddBroker,
  onRemoveBroker,
}: ConnectionFieldsProps) {
  const fieldError = (field: string) => fieldErrors[field as keyof ConnectionFieldErrors];

  return (
    <div className="connection-fields">
      <label className="connection-field connection-field--wide">
        <span className="connection-label">
          Connection name <span>Required</span>
        </span>
        <input
          value={values.name}
          onChange={(event) => onUpdateValue('name', event.target.value)}
          placeholder="Local Kafka"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-invalid={fieldError('name') !== undefined}
          aria-describedby={fieldError('name') ? 'connection-name-error' : undefined}
        />
        {fieldError('name') ? (
          <span id="connection-name-error" className="connection-field-error" role="alert">
            {fieldError('name')}
          </span>
        ) : null}
      </label>

      <div className="connection-field connection-field--wide">
        <span className="connection-label">
          Broker addresses <span>At least one required</span>
        </span>
        <div className="connection-brokers">
          {values.brokers.map((broker, index) => {
            const errorId = `connection-broker-${index}-error`;
            return (
              <div className="connection-broker-row" key={broker.id}>
                <div className="connection-broker-input">
                  <input
                    value={broker.address}
                    onChange={(event) => onUpdateBroker(index, event.target.value)}
                    placeholder="host:port"
                    autoComplete="off"
                    aria-label={`Broker address ${index + 1}`}
                    aria-invalid={fieldError(`brokers.${index}`) !== undefined}
                    aria-describedby={fieldError(`brokers.${index}`) ? errorId : undefined}
                  />
                  {fieldError(`brokers.${index}`) ? (
                    <span id={errorId} className="connection-field-error" role="alert">
                      {fieldError(`brokers.${index}`)}
                    </span>
                  ) : null}
                </div>
                <button
                  className="connection-icon-button"
                  type="button"
                  onClick={() => onRemoveBroker(index)}
                  disabled={values.brokers.length === 1 || isSubmitting}
                  aria-label={`Remove broker address ${index + 1}`}
                >
                  <Trash width={15} height={15} />
                </button>
              </div>
            );
          })}
        </div>
        <button
          className="connection-add-broker"
          type="button"
          onClick={onAddBroker}
          disabled={isSubmitting}
        >
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
          onChange={(event) => onUpdateValue('clientId', event.target.value)}
          autoComplete="off"
          aria-invalid={fieldError('clientId') !== undefined}
          aria-describedby={fieldError('clientId') ? 'connection-client-id-error' : undefined}
        />
        {fieldError('clientId') ? (
          <span id="connection-client-id-error" className="connection-field-error" role="alert">
            {fieldError('clientId')}
          </span>
        ) : null}
      </label>

      <label className="connection-field">
        <span className="connection-label">
          Dial timeout <span>Seconds</span>
        </span>
        <input
          inputMode="numeric"
          value={values.dialTimeoutSeconds}
          onChange={(event) => onUpdateValue('dialTimeoutSeconds', event.target.value)}
          aria-invalid={fieldError('dialTimeoutSeconds') !== undefined}
          aria-describedby={
            fieldError('dialTimeoutSeconds') ? 'connection-timeout-error' : undefined
          }
        />
        {fieldError('dialTimeoutSeconds') ? (
          <span id="connection-timeout-error" className="connection-field-error" role="alert">
            {fieldError('dialTimeoutSeconds')}
          </span>
        ) : null}
      </label>
    </div>
  );
}
