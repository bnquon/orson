import type { ApiError } from '../../api/result';

export function selectSetupError(
  startupError: ApiError | null,
  bridgeError: ApiError | null,
  connectionError: ApiError | null,
): ApiError | null {
  return startupError ?? bridgeError ?? connectionError;
}

export function selectDialogError(
  bridgeError: ApiError | null,
  connectionError: ApiError | null,
): ApiError | null {
  return bridgeError ?? connectionError;
}
