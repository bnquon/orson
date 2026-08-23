import { WarningCircle } from 'iconoir-react';
import type { ApiError } from '../../api/result';
import { LoadingDots } from '../../components/LoadingDots';
import type { ConnectionFieldErrors, StartupStatus } from './types';

interface ConnectionErrorProps {
  fieldErrors: ConnectionFieldErrors;
  error: ApiError | null;
  startupStatus: StartupStatus;
  isSubmitting: boolean;
  onRetryStartup?: () => void;
}

export function ConnectionError({
  fieldErrors,
  error,
  startupStatus,
  isSubmitting,
  onRetryStartup,
}: ConnectionErrorProps) {
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  return (
    <>
      {hasFieldErrors ? (
        <div className="connection-error connection-error--validation" role="alert">
          <WarningCircle width={16} height={16} />
          <div>
            <strong>Review the connection details.</strong>
            <p>Fix the highlighted fields before connecting.</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="connection-error" role="alert">
          <WarningCircle width={16} height={16} />
          <div>
            <strong>{error.message}</strong>
            {error.details ? <p>{error.details}</p> : null}
            {startupStatus !== 'ready' && onRetryStartup ? (
              <button
                className="connection-retry-button"
                type="button"
                onClick={onRetryStartup}
                disabled={isSubmitting || startupStatus === 'loading'}
                aria-busy={startupStatus === 'loading'}
              >
                {startupStatus === 'loading' ? (
                  <>
                    <LoadingDots size="inline" /> Checking status…
                  </>
                ) : (
                  'Retry status'
                )}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
