package api

// APIError is the shared error shape returned by Wails methods.
// Individual API responses can carry this error alongside their own data type.
type APIError struct {
	Code        string            `json:"code"`
	Message     string            `json:"message"`
	Details     string            `json:"details,omitempty"`
	FieldErrors map[string]string `json:"fieldErrors,omitempty"`
	Retryable   bool              `json:"retryable"`
}

func NewError(code, message, details string, retryable bool) *APIError {
	return &APIError{
		Code:      code,
		Message:   message,
		Details:   details,
		Retryable: retryable,
	}
}
