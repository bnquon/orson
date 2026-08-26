import { describe, expect, it } from 'vitest';
import type { ApiError } from '../../api/result';
import { selectDialogError } from './errorSelection';

const error = (code: string): ApiError => ({
  code,
  message: code,
  retryable: false,
});

describe('connection error selection', () => {
  it('prioritizes bridge errors over connection errors in the dialog', () => {
    const bridgeError = error('bridge');
    const connectionError = error('connection');

    expect(selectDialogError(bridgeError, connectionError)).toBe(bridgeError);
    expect(selectDialogError(null, connectionError)).toBe(connectionError);
  });
});
