import type { Result, WireResponse } from './result';

export async function call<T>(request: () => Promise<WireResponse<T>>): Promise<Result<T>> {
  try {
    const response = await request();

    if (response.ok && response.data !== undefined) {
      return {
        ok: true,
        data: response.data,
      };
    }

    return {
      ok: false,
      error: response.error ?? {
        code: 'unknown_error',
        message: 'Something went wrong.',
        retryable: false,
      },
    };
  } catch {
    // This catch is only for truly unexpected Wails bridge/runtime errors.
    // Expected backend failures should arrive as { ok: false } responses.
    return {
      ok: false,
      error: {
        code: 'bridge_error',
        message: 'The app could not communicate with the backend.',
        retryable: true,
      },
    };
  }
}
