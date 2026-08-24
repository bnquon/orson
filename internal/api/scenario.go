package api

type ScenarioTopologyEdge struct {
	ID   string `json:"id"`
	From string `json:"from"`
	To   string `json:"to"`
}

type ScenarioWarning struct {
	Code           string `json:"code"`
	Message        string `json:"message"`
	SourceFilename string `json:"sourceFilename,omitempty"`
	Line           int    `json:"line,omitempty"`
	Column         int    `json:"column,omitempty"`
}

type ScenarioData struct {
	Name              string                 `json:"name"`
	SourceFilename    string                 `json:"sourceFilename"`
	PublishTopic      string                 `json:"publishTopic"`
	PublishPayload    string                 `json:"publishPayload"`
	WatchedTopics     []string               `json:"watchedTopics"`
	CorrelationHeader string                 `json:"correlationHeader"`
	CaptureTimeoutSec int                    `json:"captureTimeoutSeconds"`
	Topology          []ScenarioTopologyEdge `json:"topology"`
	Warnings          []ScenarioWarning      `json:"warnings,omitempty"`
}

type ScenarioResponse struct {
	OK    bool          `json:"ok"`
	Data  *ScenarioData `json:"data,omitempty"`
	Error *APIError     `json:"error,omitempty"`
}

func ScenarioSuccess(data ScenarioData) ScenarioResponse {
	return ScenarioResponse{OK: true, Data: &data}
}

func ScenarioFailure(err *APIError) ScenarioResponse {
	return ScenarioResponse{Error: err}
}
