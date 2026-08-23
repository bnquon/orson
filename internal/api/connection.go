package api

import (
	"errors"
	"strings"
)

const (
	ConnectionStatusDisconnected = "disconnected"
	ConnectionStatusConnecting   = "connecting"
	ConnectionStatusConnected    = "connected"
	ConnectionStatusFailed       = "failed"
)

type ConnectionRequest struct {
	Name               string   `json:"name"`
	Brokers            []string `json:"brokers"`
	ClientID           string   `json:"clientId"`
	DialTimeoutSeconds int      `json:"dialTimeoutSeconds"`
}

func (r ConnectionRequest) Normalize() ConnectionRequest {
	normalized := r
	normalized.Name = strings.TrimSpace(normalized.Name)
	normalized.ClientID = strings.TrimSpace(normalized.ClientID)
	normalized.Brokers = make([]string, len(r.Brokers))

	for i, broker := range r.Brokers {
		normalized.Brokers[i] = strings.TrimSpace(broker)
	}

	return normalized
}

func (r ConnectionRequest) Validate() error {
	if strings.TrimSpace(r.Name) == "" {
		return errors.New("connection name is required")
	}

	if len(r.Brokers) == 0 {
		return errors.New("at least one broker is required")
	}

	for _, broker := range r.Brokers {
		if strings.TrimSpace(broker) == "" {
			return errors.New("broker address cannot be empty")
		}
	}

	if strings.TrimSpace(r.ClientID) == "" {
		return errors.New("client ID cannot be empty")
	}

	if r.DialTimeoutSeconds <= 0 {
		return errors.New("dial timeout must be positive")
	}

	return nil
}

type ConnectionInfo struct {
	Name               string   `json:"name"`
	Brokers            []string `json:"brokers"`
	ClientID           string   `json:"clientId"`
	DialTimeoutSeconds int      `json:"dialTimeoutSeconds"`
}

type ConnectionAttempt struct {
	Status string    `json:"status"`
	Error  *APIError `json:"error,omitempty"`
}

type ConnectionState struct {
	Active        *ConnectionInfo   `json:"active,omitempty"`
	LatestAttempt ConnectionAttempt `json:"latestAttempt"`
}

type ConnectionResponse struct {
	OK    bool             `json:"ok"`
	Data  *ConnectionState `json:"data,omitempty"`
	Error *APIError        `json:"error,omitempty"`
}

type ConnectionStatusResponse struct {
	OK    bool             `json:"ok"`
	Data  *ConnectionState `json:"data,omitempty"`
	Error *APIError        `json:"error,omitempty"`
}

func ConnectionSuccess(state ConnectionState) ConnectionResponse {
	return ConnectionResponse{
		OK:   true,
		Data: &state,
	}
}

func ConnectionFailure(err *APIError) ConnectionResponse {
	return ConnectionResponse{
		Error: err,
	}
}

func ConnectionStatusSuccess(state ConnectionState) ConnectionStatusResponse {
	return ConnectionStatusResponse{
		OK:   true,
		Data: &state,
	}
}

func ConnectionStatusFailure(err *APIError) ConnectionStatusResponse {
	return ConnectionStatusResponse{
		Error: err,
	}
}
