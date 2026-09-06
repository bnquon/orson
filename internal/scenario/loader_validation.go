package scenario

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"orson/internal/correlation"

	"gopkg.in/yaml.v3"
)

func validate(filename string, raw rawScenario, locations map[string]sourceLocation) (Scenario, error) {
	issues := make([]Issue, 0)
	addIssue := func(code, path, message string, node *yaml.Node) {
		line, column := nodeLocation(node)
		if line == 0 {
			line, column = locationForPath(locations, path)
		}
		issues = append(issues, Issue{
			Code:    code,
			Path:    path,
			Message: message,
			Line:    line,
			Column:  column,
		})
	}

	name := ""
	if raw.Name == nil || strings.TrimSpace(*raw.Name) == "" {
		addIssue("missing_name", "name", "scenario name is required", nil)
	} else {
		name = strings.TrimSpace(*raw.Name)
	}

	rootTopic := ""
	messageKey := ""
	headers := []Header{{Key: "content-type", Value: "application/json"}}
	var payloadNode *yaml.Node
	if raw.Publish == nil {
		addIssue("missing_publish", "publish", "publish configuration is required", nil)
	} else {
		if raw.Publish.Topic == nil || strings.TrimSpace(*raw.Publish.Topic) == "" {
			addIssue("missing_publish_topic", "publish.topic", "publish topic is required", nil)
		} else {
			rootTopic = strings.TrimSpace(*raw.Publish.Topic)
		}
		payloadNode = raw.Publish.Payload
		if payloadNode == nil || isEmptyPayloadNode(payloadNode) {
			addIssue("missing_publish_payload", "publish.payload", "publish payload is required", payloadNode)
		}
		if raw.Publish.Key != nil {
			messageKey = *raw.Publish.Key
		}
		if raw.Publish.Headers != nil {
			headers = make([]Header, 0, len(*raw.Publish.Headers))
			for index, rawHeader := range *raw.Publish.Headers {
				path := fmt.Sprintf("publish.headers[%d]", index)
				key := optionalString(rawHeader.Key)
				if key == "" {
					addIssue("missing_publish_header_key", path+".key", "publish header name is required", nil)
					continue
				}
				headers = append(headers, Header{Key: key, Value: stringValue(rawHeader.Value)})
			}
		}
	}

	watchedTopics := make([]string, 0)
	if raw.Watch == nil || len(*raw.Watch) == 0 {
		addIssue("missing_watch", "watch", "at least one watched topic is required", nil)
	} else {
		watchedTopics = make([]string, len(*raw.Watch))
		seenTopics := make(map[string]int, len(*raw.Watch))
		for index, topic := range *raw.Watch {
			normalized := strings.TrimSpace(topic)
			watchedTopics[index] = normalized
			path := fmt.Sprintf("watch[%d]", index)
			if normalized == "" {
				addIssue("empty_watch_topic", path, "watched topic cannot be empty", nil)
				continue
			}
			if normalized == rootTopic {
				addIssue("watched_publish_topic", path, "the publish topic is included automatically and cannot also be watched", nil)
				continue
			}
			if previous, exists := seenTopics[normalized]; exists {
				addIssue("duplicate_watch_topic", path, fmt.Sprintf("watched topic %q is duplicated from watch[%d]", normalized, previous), nil)
				continue
			}
			seenTopics[normalized] = index
		}
	}

	correlationHeader := correlation.DefaultHeader
	correlationWarnings := make([]Warning, 0, 1)
	if raw.Correlation == nil || raw.Correlation.Header == nil || strings.TrimSpace(*raw.Correlation.Header) == "" {
		line, column := locationForPath(locations, "correlation.header")
		correlationWarnings = append(correlationWarnings, Warning{
			Code: "missing_correlation_header",
			Path: "correlation.header",
			Message: fmt.Sprintf(
				"correlation header is missing or blank; %s will be used",
				correlation.DefaultHeader,
			),
			Line:   line,
			Column: column,
		})
	} else {
		correlationHeader = correlation.ResolveHeader(*raw.Correlation.Header)
	}
	for index, header := range headers {
		if correlation.HeaderNamesEqual(header.Key, correlationHeader) {
			addIssue(
				"managed_correlation_header",
				fmt.Sprintf("publish.headers[%d].key", index),
				fmt.Sprintf("header %q is managed automatically by Orson and must be removed from publish headers", correlationHeader),
				nil,
			)
		}
	}

	var captureTimeout time.Duration
	if raw.Capture == nil || raw.Capture.Timeout == nil || strings.TrimSpace(*raw.Capture.Timeout) == "" {
		addIssue("missing_capture_timeout", "capture.timeout", "capture timeout is required", nil)
	} else {
		parsed, err := time.ParseDuration(strings.TrimSpace(*raw.Capture.Timeout))
		if err != nil || parsed <= 0 {
			addIssue("invalid_capture_timeout", "capture.timeout", "capture timeout must be a positive duration", nil)
		} else if parsed%time.Second != 0 {
			addIssue("fractional_capture_timeout", "capture.timeout", "capture timeout must resolve to whole seconds", nil)
		} else if parsed > 300*time.Second {
			addIssue("capture_timeout_too_large", "capture.timeout", "capture timeout must be 300 seconds or less", nil)
		} else {
			captureTimeout = parsed
		}
	}

	if len(issues) > 0 {
		return Scenario{}, &LoadError{Stage: "validation", Issues: issues}
	}

	payload, err := payloadJSON(payloadNode)
	if err != nil {
		return Scenario{}, &LoadError{
			Stage: "validation",
			Issues: []Issue{{
				Code:    "invalid_publish_payload",
				Path:    "publish.payload",
				Message: fmt.Sprintf("publish payload cannot be converted to JSON: %v", err),
				Line:    payloadNode.Line,
				Column:  payloadNode.Column,
			}},
		}
	}

	configuredTopics := make(map[string]struct{}, len(watchedTopics)+1)
	configuredTopics[rootTopic] = struct{}{}
	for _, topic := range watchedTopics {
		configuredTopics[topic] = struct{}{}
	}

	warnings := append([]Warning(nil), correlationWarnings...)
	edges := make([]TopologyEdge, 0, len(raw.Topology))
	configuredEdges := make([]TopologyEdge, 0, len(raw.Topology))
	seenEdges := make(map[string]struct{}, len(raw.Topology))
	connectedTopics := make(map[string]struct{}, len(configuredTopics))
	for index, rawEdge := range raw.Topology {
		from := optionalString(rawEdge.From)
		to := optionalString(rawEdge.To)
		location := fmt.Sprintf("topology[%d]", index)
		configuredEdges = append(configuredEdges, TopologyEdge{
			ID:     fmt.Sprintf("configured-edge:%d", index),
			From:   from,
			To:     to,
			source: sourceLocation{line: rawEdge.Line, column: rawEdge.Column},
		})
		if from == "" || to == "" {
			warnings = append(warnings, Warning{
				Code:    "invalid_topology_edge",
				Path:    location,
				Message: fmt.Sprintf("%s was omitted because both from and to topics are required", location),
				Line:    rawEdge.Line,
				Column:  rawEdge.Column,
			})
			continue
		}
		if from == to {
			warnings = append(warnings, Warning{
				Code:    "self_referencing_edge",
				Path:    location,
				Message: fmt.Sprintf("topology edge %q -> %q was omitted because it references the same topic", from, to),
				Line:    rawEdge.Line,
				Column:  rawEdge.Column,
			})
			continue
		}
		if _, exists := configuredTopics[from]; !exists {
			warnings = append(warnings, Warning{
				Code:    "unknown_topology_source",
				Path:    location + ".from",
				Message: fmt.Sprintf("topology edge source %q is not the publish or a watched topic; the edge was omitted", from),
				Line:    rawEdge.Line,
				Column:  rawEdge.Column,
			})
			continue
		}
		if _, exists := configuredTopics[to]; !exists {
			warnings = append(warnings, Warning{
				Code:    "unknown_topology_target",
				Path:    location + ".to",
				Message: fmt.Sprintf("topology edge target %q is not the publish or a watched topic; the edge was omitted", to),
				Line:    rawEdge.Line,
				Column:  rawEdge.Column,
			})
			continue
		}

		id := edgeID(from, to)
		if _, exists := seenEdges[id]; exists {
			warnings = append(warnings, Warning{
				Code:    "duplicate_topology_edge",
				Path:    location,
				Message: fmt.Sprintf("topology edge %q -> %q was duplicated; the first edge was retained", from, to),
				Line:    rawEdge.Line,
				Column:  rawEdge.Column,
			})
			continue
		}
		seenEdges[id] = struct{}{}
		connectedTopics[from] = struct{}{}
		connectedTopics[to] = struct{}{}
		edges = append(edges, TopologyEdge{
			ID:     id,
			From:   from,
			To:     to,
			source: sourceLocation{line: rawEdge.Line, column: rawEdge.Column},
		})
	}

	if cycle, location := findCycle(rootTopic, edges); len(cycle) > 0 {
		return Scenario{}, &LoadError{
			Stage: "validation",
			Issues: []Issue{{
				Code:    "topology_cycle",
				Path:    "topology",
				Message: fmt.Sprintf("topology contains a cycle: %s", strings.Join(cycle, " -> ")),
				Line:    location.line,
				Column:  location.column,
			}},
		}
	}

	for index, topic := range watchedTopics {
		if _, connected := connectedTopics[topic]; !connected {
			line, column := locationForPath(locations, fmt.Sprintf("watch[%d]", index))
			warnings = append(warnings, Warning{
				Code:    "disconnected_watched_topic",
				Path:    fmt.Sprintf("watch[%d]", index),
				Message: fmt.Sprintf("watched topic %q is not connected to any valid topology edge", topic),
				Line:    line,
				Column:  column,
			})
		}
	}

	return Scenario{
		Name:               name,
		SourceFilename:     filename,
		PublishTopic:       rootTopic,
		PublishPayload:     payload,
		MessageKey:         messageKey,
		Headers:            headers,
		WatchedTopics:      watchedTopics,
		CorrelationHeader:  correlationHeader,
		CaptureTimeout:     captureTimeout,
		Topology:           edges,
		ConfiguredTopology: configuredEdges,
		Warnings:           warnings,
	}, nil
}

func payloadJSON(node *yaml.Node) (string, error) {
	var value any
	if err := node.Decode(&value); err != nil {
		return "", err
	}

	encoded, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	if !json.Valid(encoded) {
		return "", fmt.Errorf("result is not valid JSON")
	}

	var pretty bytes.Buffer
	if err := json.Indent(&pretty, encoded, "", "  "); err != nil {
		return "", err
	}
	return pretty.String(), nil
}

func isEmptyPayloadNode(node *yaml.Node) bool {
	return node == nil || (node.Kind == yaml.ScalarNode && strings.TrimSpace(node.Value) == "")
}

func optionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
