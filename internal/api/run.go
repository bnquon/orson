package api

import (
	"errors"
	"strings"
)

type Header struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type RunRequest struct {
	RootTopic             string   `json:"rootTopic"`
	MessageKey            string   `json:"messageKey"`
	Payload               string   `json:"payload"`
	Headers               []Header `json:"headers"`
	WatchedTopics         []string `json:"watchedTopics"`
	CaptureTimeoutSeconds int      `json:"captureTimeoutSeconds"`
}

func (r RunRequest) Validate() error {
	if strings.TrimSpace(r.RootTopic) == "" {
		return errors.New("root topic is required")
	}

	if len(r.WatchedTopics) == 0 {
		return errors.New("at least one watched topic is required")
	}

	if r.CaptureTimeoutSeconds <= 0 {
		return errors.New("capture timeout must be positive")
	}

	return nil
}

type EventRecord struct {
	Topic     string   `json:"topic"`
	Key       string   `json:"key"`
	Value     string   `json:"value"`
	Headers   []Header `json:"headers"`
	Partition int32    `json:"partition"`
	Offset    int64    `json:"offset"`
	Timestamp string   `json:"timestamp"`
}

type RunData struct {
	CorrelationID string        `json:"correlationId"`
	RootRecord    EventRecord   `json:"rootRecord"`
	Records       []EventRecord `json:"records"`
}

type RunResponse struct {
	OK    bool      `json:"ok"`
	Data  *RunData  `json:"data,omitempty"`
	Error *APIError `json:"error,omitempty"`
}

func RunSuccess(data RunData) RunResponse {
	return RunResponse{
		OK:   true,
		Data: &data,
	}
}

func RunFailure(err *APIError) RunResponse {
	return RunResponse{
		Error: err,
	}
}
