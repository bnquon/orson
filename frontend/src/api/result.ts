export const preflightErrorCodes = {
  missingTopics: 'preflight_missing_topics',
  metadataUnavailable: 'preflight_metadata_unavailable',
} as const;

export type PreflightErrorCode = (typeof preflightErrorCodes)[keyof typeof preflightErrorCodes];

export const topicDiagnosticKinds = {
  missingTopic: 'missing_topic',
  metadataUnavailable: 'metadata_unavailable',
} as const;

type TopicDiagnosticKind = (typeof topicDiagnosticKinds)[keyof typeof topicDiagnosticKinds];

export type ApiError = {
  code: string;
  message: string;
  details?: string;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  topicDiagnostics?: {
    // Keep the wire boundary open to future backend diagnostic kinds. Known
    // values are represented by TopicDiagnosticKind and its constants above.
    kind: TopicDiagnosticKind | (string & {});
    topic?: string;
    roles?: string[];
  }[];
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
