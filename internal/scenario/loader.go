package scenario

import (
	"fmt"
	"strings"
	"time"
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
