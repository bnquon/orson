package api

type ScenarioStatus string

const (
	ScenarioStatusValid             ScenarioStatus = "valid"
	ScenarioStatusValidWithWarnings ScenarioStatus = "valid_with_warnings"
	ScenarioStatusInvalid           ScenarioStatus = "invalid"
)

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

type ScenarioDiagnostic struct {
	Code           string `json:"code"`
	Path           string `json:"path,omitempty"`
	Message        string `json:"message"`
	Details        string `json:"details,omitempty"`
	SourceFilename string `json:"sourceFilename"`
	Line           int    `json:"line,omitempty"`
	Column         int    `json:"column,omitempty"`
}

type ScenarioDescriptor struct {
	ID             string               `json:"id"`
	DisplayName    string               `json:"displayName"`
	RelativePath   string               `json:"relativePath"`
	FolderPath     string               `json:"folderPath,omitempty"`
	SourceFilename string               `json:"sourceFilename"`
	Status         ScenarioStatus       `json:"status"`
	Warnings       []ScenarioWarning    `json:"warnings,omitempty"`
	Diagnostics    []ScenarioDiagnostic `json:"diagnostics,omitempty"`
}

type ScenarioListData struct {
	Scenarios []ScenarioDescriptor `json:"scenarios"`
}

type ScenarioListResponse struct {
	OK    bool              `json:"ok"`
	Data  *ScenarioListData `json:"data,omitempty"`
	Error *APIError         `json:"error,omitempty"`
}

type ScenarioData struct {
	ID                string                 `json:"id"`
	RelativePath      string                 `json:"relativePath"`
	FolderPath        string                 `json:"folderPath,omitempty"`
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

func ScenarioListSuccess(data ScenarioListData) ScenarioListResponse {
	return ScenarioListResponse{OK: true, Data: &data}
}

func ScenarioListFailure(err *APIError) ScenarioListResponse {
	return ScenarioListResponse{Error: err}
}
