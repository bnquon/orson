import type { ConnectionFieldErrors, ConnectionFormValues } from './types';

function isValidPort(port: string): boolean {
  const value = Number(port);
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function validateBroker(value: string): string | null {
  const broker = value.trim();
  if (broker.length === 0) return 'Broker address is required.';

  const separator = broker.lastIndexOf(':');
  if (separator <= 0 || separator === broker.length - 1) {
    return 'Use host:port, such as localhost:9092.';
  }

  const host = broker.slice(0, separator).trim();
  const port = broker.slice(separator + 1).trim();
  const validHost = isValidBrokerHost(host);

  if (!validHost || !isValidPort(port)) {
    return 'Use a host and a port from 1 to 65535.';
  }

  return null;
}

function isValidBrokerHost(host: string): boolean {
  if (host.startsWith('[') || host.endsWith(']')) {
    if (!host.startsWith('[') || !host.endsWith(']')) return false;

    const address = host.slice(1, -1);
    if (address.length === 0 || !address.includes(':')) return false;

    try {
      new URL(`http://${host}:1`);
      return true;
    } catch {
      return false;
    }
  }

  return host.length > 0 && !host.includes(':');
}

export function validateConnectionValues(values: ConnectionFormValues): ConnectionFieldErrors {
  const errors: ConnectionFieldErrors = {};

  if (values.name.trim().length === 0) {
    errors.name = 'Connection name is required.';
  }

  values.brokers.forEach((broker, index) => {
    const error = validateBroker(broker);
    if (error !== null) errors[`brokers.${index}`] = error;
  });

  if (values.brokers.length === 0) {
    errors['brokers.0'] = 'Add at least one broker address.';
  }

  if (values.clientId.trim().length === 0) {
    errors.clientId = 'Client ID is required.';
  }

  const timeout = Number(values.dialTimeoutSeconds);
  if (!Number.isInteger(timeout) || timeout <= 0) {
    errors.dialTimeoutSeconds = 'Dial timeout must be a positive whole number.';
  }

  return errors;
}

export function hasConnectionFieldErrors(errors: ConnectionFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
