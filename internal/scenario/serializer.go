package scenario

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// Draft is the complete user-editable scenario shape accepted by save
// operations. It deliberately excludes connection, credentials, run, event,
// and inspector state.
type Draft struct {
	Name              string
	PublishTopic      string
	PublishPayload    string
	MessageKey        string
	Headers           []Header
	WatchedTopics     []string
	CorrelationHeader string
	CaptureTimeout    time.Duration
	Topology          []TopologyEdge
}

// NormalizeDraft validates a workbench draft through the same loader used for
// bundled and imported YAML files.
func NormalizeDraft(filename string, draft Draft) (Scenario, error) {
	source, err := marshalDraft(draft)
	if err != nil {
		return Scenario{}, err
	}
	return Load(filename, source)
}

// CanonicalizeDraft validates a draft and serializes the normalized result in
// the canonical format used for local scenario files.
func CanonicalizeDraft(filename string, draft Draft) (Scenario, []byte, error) {
	loaded, err := NormalizeDraft(filename, draft)
	if err != nil {
		return Scenario{}, nil, err
	}
	source, err := MarshalCanonical(loaded)
	if err != nil {
		return Scenario{}, nil, err
	}
	return loaded, source, nil
}

// MarshalCanonical serializes a validated scenario with deterministic field
// and whitespace formatting. Semantically ordered lists retain their configured
// order; headers, watched topics, and topology edges are never sorted.
func MarshalCanonical(value Scenario) ([]byte, error) {
	topology := value.ConfiguredTopology
	if topology == nil {
		topology = value.Topology
	}
	return marshalDraft(Draft{
		Name:              value.Name,
		PublishTopic:      value.PublishTopic,
		PublishPayload:    value.PublishPayload,
		MessageKey:        value.MessageKey,
		Headers:           append([]Header(nil), value.Headers...),
		WatchedTopics:     append([]string(nil), value.WatchedTopics...),
		CorrelationHeader: value.CorrelationHeader,
		CaptureTimeout:    value.CaptureTimeout,
		Topology:          append([]TopologyEdge(nil), topology...),
	})
}

func marshalDraft(draft Draft) ([]byte, error) {
	payload, err := jsonPayloadNode(draft.PublishPayload)
	if err != nil {
		return nil, &LoadError{Stage: "validation", Issues: []Issue{{
			Code:    "invalid_publish_payload",
			Path:    "publish.payload",
			Message: "publish payload must contain valid JSON",
			Details: err.Error(),
		}}}
	}

	root := mappingNode()
	appendMapping(root, scalar("name"), scalar(draft.Name))

	publish := mappingNode()
	appendMapping(publish, scalar("topic"), scalar(draft.PublishTopic))
	appendMapping(publish, scalar("key"), scalar(draft.MessageKey))
	headers := sequenceNode()
	for _, header := range draft.Headers {
		item := mappingNode()
		appendMapping(item, scalar("key"), scalar(header.Key))
		appendMapping(item, scalar("value"), scalar(header.Value))
		headers.Content = append(headers.Content, item)
	}
	appendMapping(publish, scalar("headers"), headers)
	appendMapping(publish, scalar("payload"), payload)
	appendMapping(root, scalar("publish"), publish)

	watch := sequenceNode()
	for _, topic := range draft.WatchedTopics {
		watch.Content = append(watch.Content, scalar(topic))
	}
	appendMapping(root, scalar("watch"), watch)

	correlation := mappingNode()
	appendMapping(correlation, scalar("header"), scalar(draft.CorrelationHeader))
	appendMapping(root, scalar("correlation"), correlation)

	capture := mappingNode()
	appendMapping(capture, scalar("timeout"), scalar(draft.CaptureTimeout.String()))
	appendMapping(root, scalar("capture"), capture)

	topology := sequenceNode()
	for _, edge := range draft.Topology {
		item := mappingNode()
		appendMapping(item, scalar("from"), scalar(edge.From))
		appendMapping(item, scalar("to"), scalar(edge.To))
		topology.Content = append(topology.Content, item)
	}
	appendMapping(root, scalar("topology"), topology)

	document := &yaml.Node{Kind: yaml.DocumentNode, Content: []*yaml.Node{root}}
	var output bytes.Buffer
	encoder := yaml.NewEncoder(&output)
	encoder.SetIndent(2)
	if err := encoder.Encode(document); err != nil {
		return nil, fmt.Errorf("encode canonical scenario YAML: %w", err)
	}
	if err := encoder.Close(); err != nil {
		return nil, fmt.Errorf("finish canonical scenario YAML: %w", err)
	}
	return output.Bytes(), nil
}

func jsonPayloadNode(payload string) (*yaml.Node, error) {
	if strings.TrimSpace(payload) == "" || !json.Valid([]byte(payload)) {
		return nil, fmt.Errorf("payload is not valid JSON")
	}

	var document yaml.Node
	if err := yaml.Unmarshal([]byte(payload), &document); err != nil {
		return nil, err
	}
	if len(document.Content) != 1 {
		return nil, fmt.Errorf("payload has no document value")
	}
	value := document.Content[0]
	clearCollectionStyles(value)
	return value, nil
}

func clearCollectionStyles(node *yaml.Node) {
	if node == nil {
		return
	}
	node.Style = 0
	for _, child := range node.Content {
		clearCollectionStyles(child)
	}
}

func mappingNode() *yaml.Node {
	return &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
}

func sequenceNode() *yaml.Node {
	return &yaml.Node{Kind: yaml.SequenceNode, Tag: "!!seq"}
}

func scalar(value string) *yaml.Node {
	return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: value}
}

func appendMapping(mapping, key, value *yaml.Node) {
	mapping.Content = append(mapping.Content, key, value)
}
