package run

import (
	"context"
	"fmt"
	"strings"
	"time"
)

const preflightTimeout = 10 * time.Second

type TopicDiagnosticKind string

const (
	TopicDiagnosticMissingTopic        TopicDiagnosticKind = "missing_topic"
	TopicDiagnosticMetadataUnavailable TopicDiagnosticKind = "metadata_unavailable"
)

type TopicDiagnostic struct {
	Kind  TopicDiagnosticKind
	Topic string
	Roles []string
}

type PreflightError struct {
	Diagnostics []TopicDiagnostic
	Cause       error
}

func (e *PreflightError) Retryable() bool {
	for _, diagnostic := range e.Diagnostics {
		if diagnostic.Kind == TopicDiagnosticMetadataUnavailable {
			return true
		}
	}
	return false
}

func (e *PreflightError) Error() string {
	if e.Retryable() {
		return "Kafka topic metadata could not be checked"
	}
	return "Configured Kafka topics are missing"
}

func (e *PreflightError) Unwrap() error { return e.Cause }

func (c *Coordinator) preflight(ctx context.Context, request RunRequest) error {
	roles := make(map[string][]string)
	names := []string{request.RootMessage.Topic}
	roles[request.RootMessage.Topic] = []string{"root"}
	for _, topic := range request.WatchedTopics {
		if _, ok := roles[topic]; !ok {
			names = append(names, topic)
		}
		roles[topic] = append(roles[topic], "watched")
	}
	ctx, cancel := context.WithTimeout(ctx, preflightTimeout)
	defer cancel()
	metadata, err := c.kafkaClient.LookupTopics(ctx, names)
	if err != nil {
		return &PreflightError{Diagnostics: []TopicDiagnostic{{Kind: TopicDiagnosticMetadataUnavailable}}, Cause: err}
	}
	byName := make(map[string]int, len(metadata))
	for i, topic := range metadata {
		byName[topic.Name] = i
	}
	failure := &PreflightError{}
	for _, name := range names {
		var kind TopicDiagnosticKind
		index, ok := byName[name]
		if !ok {
			kind = TopicDiagnosticMetadataUnavailable
		} else if metadata[index].Err != nil {
			kind = TopicDiagnosticMetadataUnavailable
			failure.Cause = metadata[index].Err
		} else if metadata[index].Missing {
			kind = TopicDiagnosticMissingTopic
		}
		if kind != "" {
			failure.Diagnostics = append(failure.Diagnostics, TopicDiagnostic{Kind: kind, Topic: name, Roles: roles[name]})
		}
	}
	if len(failure.Diagnostics) > 0 {
		return failure
	}
	return nil
}

func normalizeRequest(request RunRequest) (RunRequest, error) {
	request.RootMessage.Topic = strings.TrimSpace(request.RootMessage.Topic)
	if request.RootMessage.Topic == "" {
		return request, fmt.Errorf("root topic is required")
	}
	seen := make(map[string]bool)
	topics := make([]string, 0, len(request.WatchedTopics))
	for _, topic := range request.WatchedTopics {
		topic = strings.TrimSpace(topic)
		if topic == "" {
			return request, fmt.Errorf("watched topic is required")
		}
		if !seen[topic] {
			topics = append(topics, topic)
			seen[topic] = true
		}
	}
	if len(topics) == 0 {
		return request, fmt.Errorf("at least one watched topic is required")
	}
	request.WatchedTopics = topics
	return request, nil
}
