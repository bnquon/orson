package scenario

import (
	"bytes"
	"errors"
	"fmt"
	"io"

	"gopkg.in/yaml.v3"
)

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
