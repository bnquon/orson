package api

const (
	ErrorCodePreflightMissingTopics       = "preflight_missing_topics"
	ErrorCodePreflightMetadataUnavailable = "preflight_metadata_unavailable"
)

// APIError is the shared error shape returned by Wails methods.
// Individual API responses can carry this error alongside their own data type.
type APIError struct {
	TopicDiagnostics []TopicDiagnostic `json:"topicDiagnostics,omitempty"`
	Code             string            `json:"code"`
	Message          string            `json:"message"`
	Details          string            `json:"details,omitempty"`
	FieldErrors      map[string]string `json:"fieldErrors,omitempty"`
	Retryable        bool              `json:"retryable"`
}

type TopicDiagnosticKind string

const (
	TopicDiagnosticMissingTopic        TopicDiagnosticKind = "missing_topic"
	TopicDiagnosticMetadataUnavailable TopicDiagnosticKind = "metadata_unavailable"
)

type TopicDiagnostic struct {
	Kind  TopicDiagnosticKind `json:"kind"`
	Topic string              `json:"topic,omitempty"`
	Roles []string            `json:"roles,omitempty"`
}

func NewError(code, message, details string, retryable bool) *APIError {
	return &APIError{
		Code:      code,
		Message:   message,
		Details:   details,
		Retryable: retryable,
	}
}
