package scenario

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// Scenario is the validated, runtime-independent representation of a YAML
// scenario. It intentionally contains no frontend form state.
type Scenario struct {
	Name              string
	SourceFilename    string
	PublishTopic      string
	PublishPayload    string
	WatchedTopics     []string
	CorrelationHeader string
	CaptureTimeout    time.Duration
	Topology          []TopologyEdge
	Warnings          []Warning
}

type TopologyEdge struct {
	ID   string
	From string
	To   string
}

type Warning struct {
	Code    string
	Message string
	Line    int
	Column  int
}

type Issue struct {
	Code    string
	Path    string
	Message string
	Line    int
	Column  int
}

type LoadError struct {
	Stage  string
	Issues []Issue
}

type sourceError struct {
	line    int
	column  int
	message string
}

func (e *sourceError) Error() string {
	return e.message
}

func (e *LoadError) Error() string {
	if e == nil || len(e.Issues) == 0 {
		return "scenario could not be loaded"
	}

	messages := make([]string, 0, len(e.Issues))
	for _, issue := range e.Issues {
		messages = append(messages, issue.Message)
	}
	return strings.Join(messages, "; ")
}

type rawScenario struct {
	Name        *string         `yaml:"name"`
	Publish     *rawPublish     `yaml:"publish"`
	Watch       *[]string       `yaml:"watch"`
	Correlation *rawCorrelation `yaml:"correlation"`
	Capture     *rawCapture     `yaml:"capture"`
	Topology    []rawEdge       `yaml:"topology"`
}

type rawPublish struct {
	Topic   *string    `yaml:"topic"`
	Payload *yaml.Node `yaml:"payload"`
}

func (p *rawPublish) UnmarshalYAML(node *yaml.Node) error {
	if node.Kind != yaml.MappingNode {
		return newSourceError(node, "publish must be a mapping")
	}

	for index := 0; index+1 < len(node.Content); index += 2 {
		key := node.Content[index]
		value := node.Content[index+1]
		switch key.Value {
		case "topic":
			var topic string
			if err := value.Decode(&topic); err != nil {
				return newSourceError(value, fmt.Sprintf("publish.topic: %v", err))
			}
			p.Topic = &topic
		case "payload":
			p.Payload = value
		default:
			return newSourceError(key, fmt.Sprintf("field %q not found in type scenario.rawPublish", key.Value))
		}
	}

	return nil
}

type rawCorrelation struct {
	Header *string `yaml:"header"`
}

type rawCapture struct {
	Timeout *string `yaml:"timeout"`
}

type rawEdge struct {
	From   *string `yaml:"from"`
	To     *string `yaml:"to"`
	Line   int     `yaml:"-"`
	Column int     `yaml:"-"`
}

func (e *rawEdge) UnmarshalYAML(node *yaml.Node) error {
	if node.Kind != yaml.MappingNode {
		return newSourceError(node, "topology edge must be a mapping")
	}

	e.Line = node.Line
	e.Column = node.Column
	for index := 0; index+1 < len(node.Content); index += 2 {
		key := node.Content[index]
		value := node.Content[index+1]
		switch key.Value {
		case "from":
			var from string
			if err := value.Decode(&from); err != nil {
				return newSourceError(value, fmt.Sprintf("topology.from: %v", err))
			}
			e.From = &from
		case "to":
			var to string
			if err := value.Decode(&to); err != nil {
				return newSourceError(value, fmt.Sprintf("topology.to: %v", err))
			}
			e.To = &to
		default:
			return newSourceError(key, fmt.Sprintf("field %q not found in type scenario.rawEdge", key.Value))
		}
	}

	return nil
}

// Load decodes and validates one scenario source. Decode and semantic
// validation are kept as separate phases so callers can distinguish YAML
// syntax/schema failures from invalid scenario configuration.
func Load(filename string, source []byte) (Scenario, error) {
	raw, locations, err := decode(filename, source)
	if err != nil {
		return Scenario{}, err
	}

	return validate(filename, raw, locations)
}

func decode(filename string, source []byte) (rawScenario, map[string]sourceLocation, error) {
	var raw rawScenario
	decoder := yaml.NewDecoder(bytes.NewReader(source))
	decoder.KnownFields(true)
	if err := decoder.Decode(&raw); err != nil {
		line, column := yamlErrorLocation(err)
		var locatedErr *sourceError
		if errors.As(err, &locatedErr) {
			line = locatedErr.line
			column = locatedErr.column
		}
		return rawScenario{}, nil, &LoadError{
			Stage: "yaml_parse",
			Issues: []Issue{{
				Code:    "yaml_decode_failed",
				Path:    filename,
				Message: err.Error(),
				Line:    line,
				Column:  column,
			}},
		}
	}

	return raw, sourceLocations(source), nil
}

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
			if previous, exists := seenTopics[normalized]; exists {
				addIssue("duplicate_watch_topic", path, fmt.Sprintf("watched topic %q is duplicated from watch[%d]", normalized, previous), nil)
				continue
			}
			seenTopics[normalized] = index
		}
	}

	correlationHeader := ""
	if raw.Correlation == nil || raw.Correlation.Header == nil || strings.TrimSpace(*raw.Correlation.Header) == "" {
		addIssue("missing_correlation_header", "correlation.header", "correlation header is required", nil)
	} else {
		correlationHeader = strings.TrimSpace(*raw.Correlation.Header)
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

	warnings := make([]Warning, 0)
	edges := make([]TopologyEdge, 0, len(raw.Topology))
	seenEdges := make(map[string]struct{}, len(raw.Topology))
	connectedTopics := make(map[string]struct{}, len(configuredTopics))
	for index, rawEdge := range raw.Topology {
		from := optionalString(rawEdge.From)
		to := optionalString(rawEdge.To)
		location := fmt.Sprintf("topology[%d]", index)
		if from == "" || to == "" {
			warnings = append(warnings, Warning{
				Code:    "invalid_topology_edge",
				Message: fmt.Sprintf("%s was omitted because both from and to topics are required", location),
				Line:    rawEdge.Line,
				Column:  rawEdge.Column,
			})
			continue
		}
		if from == to {
			warnings = append(warnings, Warning{
				Code:    "self_referencing_edge",
				Message: fmt.Sprintf("topology edge %q -> %q was omitted because it references the same topic", from, to),
				Line:    rawEdge.Line,
				Column:  rawEdge.Column,
			})
			continue
		}
		if _, exists := configuredTopics[from]; !exists {
			warnings = append(warnings, Warning{
				Code:    "unknown_topology_source",
				Message: fmt.Sprintf("topology edge source %q is not the publish or a watched topic; the edge was omitted", from),
				Line:    rawEdge.Line,
				Column:  rawEdge.Column,
			})
			continue
		}
		if _, exists := configuredTopics[to]; !exists {
			warnings = append(warnings, Warning{
				Code:    "unknown_topology_target",
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
				Message: fmt.Sprintf("topology edge %q -> %q was duplicated; the first edge was retained", from, to),
				Line:    rawEdge.Line,
				Column:  rawEdge.Column,
			})
			continue
		}
		seenEdges[id] = struct{}{}
		connectedTopics[from] = struct{}{}
		connectedTopics[to] = struct{}{}
		edges = append(edges, TopologyEdge{ID: id, From: from, To: to})
	}

	if cycle := findCycle(rootTopic, edges); len(cycle) > 0 {
		return Scenario{}, &LoadError{
			Stage: "validation",
			Issues: []Issue{{
				Code:    "topology_cycle",
				Path:    "topology",
				Message: fmt.Sprintf("topology contains a cycle: %s", strings.Join(cycle, " -> ")),
			}},
		}
	}

	for index, topic := range watchedTopics {
		if _, connected := connectedTopics[topic]; !connected {
			line, column := locationForPath(locations, fmt.Sprintf("watch[%d]", index))
			warnings = append(warnings, Warning{
				Code:    "disconnected_watched_topic",
				Message: fmt.Sprintf("watched topic %q is not connected to any valid topology edge", topic),
				Line:    line,
				Column:  column,
			})
		}
	}

	return Scenario{
		Name:              name,
		SourceFilename:    filename,
		PublishTopic:      rootTopic,
		PublishPayload:    payload,
		WatchedTopics:     watchedTopics,
		CorrelationHeader: correlationHeader,
		CaptureTimeout:    captureTimeout,
		Topology:          edges,
		Warnings:          warnings,
	}, nil
}

type sourceLocation struct {
	line   int
	column int
}

func newSourceError(node *yaml.Node, message string) error {
	line, column := nodeLocation(node)
	return &sourceError{line: line, column: column, message: message}
}

func sourceLocations(source []byte) map[string]sourceLocation {
	locations := make(map[string]sourceLocation)
	var document yaml.Node
	if err := yaml.Unmarshal(source, &document); err != nil {
		return locations
	}

	root := &document
	if root.Kind == yaml.DocumentNode {
		if len(root.Content) == 0 {
			return locations
		}
		root = root.Content[0]
	}
	if root.Kind != yaml.MappingNode {
		return locations
	}

	locations[""] = locationOf(root)
	for index := 0; index+1 < len(root.Content); index += 2 {
		key := root.Content[index]
		value := root.Content[index+1]
		path := key.Value
		locations[path] = locationOf(value)
		collectNestedLocations(locations, path, value)
	}

	return locations
}

func collectNestedLocations(locations map[string]sourceLocation, path string, node *yaml.Node) {
	switch node.Kind {
	case yaml.MappingNode:
		for index := 0; index+1 < len(node.Content); index += 2 {
			key := node.Content[index]
			value := node.Content[index+1]
			nestedPath := path + "." + key.Value
			locations[nestedPath] = locationOf(value)
		}
	case yaml.SequenceNode:
		for index, value := range node.Content {
			itemPath := fmt.Sprintf("%s[%d]", path, index)
			locations[itemPath] = locationOf(value)
			collectNestedLocations(locations, itemPath, value)
		}
	}
}

func locationForPath(locations map[string]sourceLocation, path string) (int, int) {
	for current := path; ; {
		if location, exists := locations[current]; exists {
			return location.line, location.column
		}
		separator := strings.LastIndexAny(current, ".[")
		if separator < 0 {
			break
		}
		current = current[:separator]
	}
	return 0, 0
}

func locationOf(node *yaml.Node) sourceLocation {
	return sourceLocation{line: node.Line, column: node.Column}
}

func yamlErrorLocation(err error) (int, int) {
	message := err.Error()
	marker := "line "
	start := strings.Index(message, marker)
	if start < 0 {
		return 0, 0
	}

	start += len(marker)
	end := start
	for end < len(message) && message[end] >= '0' && message[end] <= '9' {
		end++
	}
	line, parseErr := strconv.Atoi(message[start:end])
	if parseErr != nil {
		return 0, 0
	}
	return line, 0
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

func nodeLocation(node *yaml.Node) (int, int) {
	if node == nil {
		return 0, 0
	}
	return node.Line, node.Column
}

func optionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func edgeID(from, to string) string {
	return "edge:" + from + "->" + to
}

func findCycle(root string, edges []TopologyEdge) []string {
	adjacency := make(map[string][]string)
	for _, edge := range edges {
		adjacency[edge.From] = append(adjacency[edge.From], edge.To)
	}

	state := make(map[string]uint8)
	path := make([]string, 0)
	var visit func(string) []string
	visit = func(topic string) []string {
		switch state[topic] {
		case 1:
			for index, item := range path {
				if item == topic {
					return append(append([]string(nil), path[index:]...), topic)
				}
			}
		case 2:
			return nil
		}

		state[topic] = 1
		path = append(path, topic)
		for _, next := range adjacency[topic] {
			if cycle := visit(next); len(cycle) > 0 {
				return cycle
			}
		}
		path = path[:len(path)-1]
		state[topic] = 2
		return nil
	}

	if cycle := visit(root); len(cycle) > 0 {
		return cycle
	}
	for topic := range adjacency {
		if state[topic] == 0 {
			if cycle := visit(topic); len(cycle) > 0 {
				return cycle
			}
		}
	}
	return nil
}

func CaptureTimeoutSeconds(timeout time.Duration) (int, error) {
	if timeout <= 0 || timeout%time.Second != 0 {
		return 0, fmt.Errorf("capture timeout %s cannot be represented as whole seconds", timeout)
	}
	seconds := int64(timeout / time.Second)
	if seconds > int64(^uint(0)>>1) {
		return 0, fmt.Errorf("capture timeout is too large")
	}
	return int(seconds), nil
}
