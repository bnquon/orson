import { WarningCircle } from 'iconoir-react';
import type { ApiError } from '../../api/result';
import type { ConnectionFieldErrors } from './types';

interface ConnectionErrorProps {
  fieldErrors: ConnectionFieldErrors;
  error: ApiError | null;
}

export function ConnectionError({ fieldErrors, error }: ConnectionErrorProps) {
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
          </div>
        </div>
      ) : null}
    </>
  );
}
