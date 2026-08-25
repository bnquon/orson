package scenario

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"orson/internal/correlation"

	"gopkg.in/yaml.v3"
)

// Scenario is the validated, runtime-independent representation of a YAML
// scenario. It intentionally contains no frontend form state.
type Scenario struct {
	Name              string
	SourceFilename    string
	PublishTopic      string
	PublishPayload    string
	MessageKey        string
	Headers           []Header
	WatchedTopics     []string
	CorrelationHeader string
	CaptureTimeout    time.Duration
	// Topology contains only edges that are safe for Flow and runtime use.
	Topology []TopologyEdge
	// ConfiguredTopology retains every YAML edge in source order for lossless saves.
	ConfiguredTopology []TopologyEdge
	Warnings           []Warning
}

type Header struct {
	Key   string
	Value string
}

type TopologyEdge struct {
	ID     string
	From   string
	To     string
	source sourceLocation
}

type Warning struct {
	Code    string
	Path    string
	Message string
	Line    int
	Column  int
}

type Issue struct {
	Code    string
	Path    string
	Message string
	Details string
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
	Topic   *string      `yaml:"topic"`
	Key     *string      `yaml:"key"`
	Headers *[]rawHeader `yaml:"headers"`
	Payload *yaml.Node   `yaml:"payload"`
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
		case "key":
			var messageKey string
			if err := value.Decode(&messageKey); err != nil {
				return newSourceError(value, fmt.Sprintf("publish.key: %v", err))
			}
			p.Key = &messageKey
		case "headers":
			var headers []rawHeader
			if err := value.Decode(&headers); err != nil {
				return err
			}
			p.Headers = &headers
		default:
			return newSourceError(key, fmt.Sprintf("unknown field %q", key.Value))
		}
	}

	return nil
}

type rawHeader struct {
	Key    *string `yaml:"key"`
	Value  *string `yaml:"value"`
	Line   int     `yaml:"-"`
	Column int     `yaml:"-"`
}

func (h *rawHeader) UnmarshalYAML(node *yaml.Node) error {
	if node.Kind != yaml.MappingNode {
		return newSourceError(node, "publish header must be a mapping")
	}

	h.Line = node.Line
	h.Column = node.Column
	for index := 0; index+1 < len(node.Content); index += 2 {
		key := node.Content[index]
		value := node.Content[index+1]
		switch key.Value {
		case "key":
			var headerKey string
			if err := value.Decode(&headerKey); err != nil {
				return newSourceError(value, fmt.Sprintf("publish.headers.key: %v", err))
			}
			h.Key = &headerKey
		case "value":
			var headerValue string
			if err := value.Decode(&headerValue); err != nil {
				return newSourceError(value, fmt.Sprintf("publish.headers.value: %v", err))
			}
			h.Value = &headerValue
		default:
			return newSourceError(key, fmt.Sprintf("unknown field %q", key.Value))
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
			return newSourceError(key, fmt.Sprintf("unknown field %q", key.Value))
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
	decoder := yaml.NewDecoder(bytes.NewReader(source))
	var document yaml.Node
	if err := decoder.Decode(&document); err != nil {
		line, column := yamlErrorLocation(err)
		return rawScenario{}, nil, &LoadError{
			Stage: "yaml_parse",
			Issues: []Issue{{
				Code:    "yaml_decode_failed",
				Path:    filename,
				Message: "the scenario YAML could not be parsed",
				Details: err.Error(),
				Line:    line,
				Column:  column,
			}},
		}
	}

	var extra yaml.Node
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		line, column := nodeLocation(&extra)
		if line == 0 && len(extra.Content) > 0 {
			line, column = nodeLocation(extra.Content[0])
		}
		code := "multiple_yaml_documents"
		message := "scenario YAML must contain exactly one document"
		details := "Remove additional YAML documents after the scenario configuration."
		if err != nil {
			code = "yaml_decode_failed"
			message = "the scenario YAML could not be parsed"
			details = err.Error()
			line, column = yamlErrorLocation(err)
		}
		return rawScenario{}, nil, &LoadError{
			Stage: "yaml_parse",
			Issues: []Issue{{
				Code: code, Path: filename, Message: message, Details: details, Line: line, Column: column,
			}},
		}
	}

	if issue, ok := findUnknownYAMLField(&document); ok {
		return rawScenario{}, nil, &LoadError{Stage: "yaml_parse", Issues: []Issue{issue}}
	}

	var raw rawScenario
	if err := document.Decode(&raw); err != nil {
		line, column := yamlErrorLocation(err)
		var locatedErr *sourceError
		if errors.As(err, &locatedErr) {
			line = locatedErr.line
			column = locatedErr.column
		}
		return rawScenario{}, nil, &LoadError{
			Stage: "yaml_parse",
			Issues: []Issue{{
				Code: "yaml_decode_failed", Path: filename, Message: "the scenario YAML could not be parsed",
				Details: err.Error(), Line: line, Column: column,
			}},
		}
	}

	return raw, sourceLocations(source), nil
}

type yamlFieldSchema struct {
	fields   map[string]*yamlFieldSchema
	elements *yamlFieldSchema
}

var scenarioYAMLSchema = mappingSchema(map[string]*yamlFieldSchema{
	"name": nil,
	"publish": mappingSchema(map[string]*yamlFieldSchema{
		"topic":   nil,
		"key":     nil,
		"headers": sequenceSchema(mappingSchema(map[string]*yamlFieldSchema{"key": nil, "value": nil})),
		"payload": nil,
	}),
	"watch":       nil,
	"correlation": mappingSchema(map[string]*yamlFieldSchema{"header": nil}),
	"capture":     mappingSchema(map[string]*yamlFieldSchema{"timeout": nil}),
	"topology":    sequenceSchema(mappingSchema(map[string]*yamlFieldSchema{"from": nil, "to": nil})),
})

func mappingSchema(fields map[string]*yamlFieldSchema) *yamlFieldSchema {
	return &yamlFieldSchema{fields: fields}
}

func sequenceSchema(elements *yamlFieldSchema) *yamlFieldSchema {
	return &yamlFieldSchema{elements: elements}
}

func findUnknownYAMLField(document *yaml.Node) (Issue, bool) {
	return findUnknownFieldAt(document, "", scenarioYAMLSchema)
}

func findUnknownFieldAt(node *yaml.Node, path string, schema *yamlFieldSchema) (Issue, bool) {
	if node == nil || schema == nil {
		return Issue{}, false
	}
	if node.Kind == yaml.DocumentNode && len(node.Content) > 0 {
		return findUnknownFieldAt(node.Content[0], path, schema)
	}
	if node.Kind == yaml.AliasNode {
		return findUnknownFieldAt(node.Alias, path, schema)
	}
	if node.Kind == yaml.MappingNode && schema.fields != nil {
		for index := 0; index+1 < len(node.Content); index += 2 {
			key := node.Content[index]
			value := node.Content[index+1]
			fieldSchema, known := schema.fields[key.Value]
			fieldPath := key.Value
			if path != "" {
				fieldPath = path + "." + key.Value
			}
			if !known {
				return Issue{
					Code: "unknown_yaml_field", Path: fieldPath,
					Message: "the scenario YAML contains an unknown field",
					Details: fmt.Sprintf("Field %q is not supported at %s.", key.Value, fieldPath),
					Line:    key.Line, Column: key.Column,
				}, true
			}
			if issue, found := findUnknownFieldAt(value, fieldPath, fieldSchema); found {
				return issue, true
			}
		}
	}
	if node.Kind == yaml.SequenceNode && schema.elements != nil {
		for index, child := range node.Content {
			if issue, found := findUnknownFieldAt(child, fmt.Sprintf("%s[%d]", path, index), schema.elements); found {
				return issue, true
			}
		}
	}
	return Issue{}, false
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
			collectNestedLocations(locations, nestedPath, value)
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

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func edgeID(from, to string) string {
	return "edge:" + from + "->" + to
}

func findCycle(root string, edges []TopologyEdge) ([]string, sourceLocation) {
	adjacency := make(map[string][]TopologyEdge)
	for _, edge := range edges {
		adjacency[edge.From] = append(adjacency[edge.From], edge)
	}

	state := make(map[string]uint8)
	path := make([]string, 0)
	var visit func(string) ([]string, sourceLocation)
	visit = func(topic string) ([]string, sourceLocation) {
		state[topic] = 1
		path = append(path, topic)
		for _, edge := range adjacency[topic] {
			switch state[edge.To] {
			case 1:
				for index, item := range path {
					if item == edge.To {
						return append(append([]string(nil), path[index:]...), edge.To), edge.source
					}
				}
			case 0:
				if cycle, location := visit(edge.To); len(cycle) > 0 {
					return cycle, location
				}
			}
		}
		path = path[:len(path)-1]
		state[topic] = 2
		return nil, sourceLocation{}
	}

	if cycle, location := visit(root); len(cycle) > 0 {
		return cycle, location
	}
	for topic := range adjacency {
		if state[topic] == 0 {
			if cycle, location := visit(topic); len(cycle) > 0 {
				return cycle, location
			}
		}
	}
	return nil, sourceLocation{}
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
