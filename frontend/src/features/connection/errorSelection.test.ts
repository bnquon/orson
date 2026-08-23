import { describe, expect, it } from 'vitest';
import type { ApiError } from '../../api/result';
import { selectDialogError, selectSetupError } from './errorSelection';

const error = (code: string): ApiError => ({
  code,
  message: code,
  retryable: false,
});

describe('connection error selection', () => {
  it('prioritizes startup, then bridge, then connection errors for setup', () => {
    const startupError = error('startup');
    const bridgeError = error('bridge');
    const connectionError = error('connection');

    expect(selectSetupError(startupError, bridgeError, connectionError)).toBe(startupError);
    expect(selectSetupError(null, bridgeError, connectionError)).toBe(bridgeError);
    expect(selectSetupError(null, null, connectionError)).toBe(connectionError);
  });

  it('prioritizes bridge errors over connection errors in the dialog', () => {
    const bridgeError = error('bridge');
    const connectionError = error('connection');

    expect(selectDialogError(bridgeError, connectionError)).toBe(bridgeError);
    expect(selectDialogError(null, connectionError)).toBe(connectionError);
  });
});
