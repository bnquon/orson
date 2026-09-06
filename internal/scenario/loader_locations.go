package scenario

import (
	"fmt"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

type sourceError struct {
	line    int
	column  int
	message string
}

func (e *sourceError) Error() string {
	return e.message
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

func nodeLocation(node *yaml.Node) (int, int) {
	if node == nil {
		return 0, 0
	}
	return node.Line, node.Column
}
