package api

type ScenarioStatus string

type ScenarioSource string

type LocalScenarioStatus string

const (
	ScenarioStatusValid             ScenarioStatus = "valid"
	ScenarioStatusValidWithWarnings ScenarioStatus = "valid_with_warnings"
	ScenarioStatusInvalid           ScenarioStatus = "invalid"
)

const (
	ScenarioSourceExample ScenarioSource = "example"
	ScenarioSourceLocal   ScenarioSource = "local"
	ScenarioSourceUnsaved ScenarioSource = "unsaved"
)

const (
	LocalScenarioStatusAvailable  LocalScenarioStatus = "available"
	LocalScenarioStatusChanged    LocalScenarioStatus = "changed"
	LocalScenarioStatusMissing    LocalScenarioStatus = "missing"
	LocalScenarioStatusUnreadable LocalScenarioStatus = "unreadable"
)

type ScenarioTopologyEdge struct {
	ID   string `json:"id"`
	From string `json:"from"`
	To   string `json:"to"`
}

type ScenarioWarning struct {
	Code           string `json:"code"`
	Path           string `json:"path,omitempty"`
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
	Source         ScenarioSource       `json:"source"`
	SourcePath     string               `json:"sourcePath,omitempty"`
	LocalStatus    LocalScenarioStatus  `json:"localStatus,omitempty"`
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
	ID                 string                 `json:"id"`
	RelativePath       string                 `json:"relativePath"`
	FolderPath         string                 `json:"folderPath,omitempty"`
	Name               string                 `json:"name"`
	SourceFilename     string                 `json:"sourceFilename"`
	Source             ScenarioSource         `json:"source"`
	SourcePath         string                 `json:"sourcePath,omitempty"`
	LocalStatus        LocalScenarioStatus    `json:"localStatus,omitempty"`
	PublishTopic       string                 `json:"publishTopic"`
	PublishPayload     string                 `json:"publishPayload"`
	MessageKey         string                 `json:"messageKey"`
	Headers            []Header               `json:"headers"`
	WatchedTopics      []string               `json:"watchedTopics"`
	CorrelationHeader  string                 `json:"correlationHeader"`
	CaptureTimeoutSec  int                    `json:"captureTimeoutSeconds"`
	Topology           []ScenarioTopologyEdge `json:"topology"`
	ConfiguredTopology []ScenarioTopologyEdge `json:"configuredTopology"`
	Warnings           []ScenarioWarning      `json:"warnings,omitempty"`
}

type ScenarioDraft struct {
	Name                  string                 `json:"name"`
	PublishTopic          string                 `json:"publishTopic"`
	PublishPayload        string                 `json:"publishPayload"`
	MessageKey            string                 `json:"messageKey"`
	Headers               []Header               `json:"headers"`
	WatchedTopics         []string               `json:"watchedTopics"`
	CorrelationHeader     string                 `json:"correlationHeader"`
	CaptureTimeoutSeconds int                    `json:"captureTimeoutSeconds"`
	Topology              []ScenarioTopologyEdge `json:"topology"`
}

type ScenarioFileData struct {
	Cancelled   bool                        `json:"cancelled"`
	Descriptor  *ScenarioDescriptor         `json:"descriptor,omitempty"`
	Scenario    *ScenarioData               `json:"scenario,omitempty"`
	Diagnostics []ScenarioDiagnostic        `json:"diagnostics,omitempty"`
	Persistence *WorkspacePersistenceStatus `json:"persistence,omitempty"`
}

type ScenarioFileResponse struct {
	OK    bool              `json:"ok"`
	Data  *ScenarioFileData `json:"data,omitempty"`
	Error *APIError         `json:"error,omitempty"`
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

func ScenarioFileSuccess(data ScenarioFileData) ScenarioFileResponse {
	return ScenarioFileResponse{OK: true, Data: &data}
}

func ScenarioFileFailure(err *APIError, diagnostics []ScenarioDiagnostic) ScenarioFileResponse {
	response := ScenarioFileResponse{Error: err}
	if len(diagnostics) > 0 {
		response.Data = &ScenarioFileData{Diagnostics: diagnostics}
	}
	return response
}
