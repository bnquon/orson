export type ApiError = {
  code: string;
  message: string;
  details?: string;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
};

export type Result<T> =
  | {
      ok: true;
      data: T;
      error?: never;
    }
  | {
      ok: false;
      data?: never;
      error: ApiError;
    };

export type WireResponse<T> = {
  ok: boolean;
  data?: T;
  error?: ApiError;
};
