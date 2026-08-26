import type { ApiError } from '../../api/result';

export function selectDialogError(
  bridgeError: ApiError | null,
  connectionError: ApiError | null,
): ApiError | null {
  return bridgeError ?? connectionError;
}
