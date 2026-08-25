package scenario

import (
	"errors"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strings"
	"sync"
)

// Status describes the result of decoding and validating one bundled file.
type Status string

const (
	StatusValid             Status = "valid"
	StatusValidWithWarnings Status = "valid_with_warnings"
	StatusInvalid           Status = "invalid"
)

// Diagnostic is a source-aware issue suitable for displaying in a scenario
// catalog without preventing other files from loading.
type Diagnostic struct {
	Code           string
	Path           string
	Message        string
	Details        string
	SourceFilename string
	Line           int
	Column         int
}

// Descriptor is the catalog representation of one discovered scenario file.
type Descriptor struct {
	ID             string
	DisplayName    string
	RelativePath   string
	FolderPath     string
	SourceFilename string
	Status         Status
	Warnings       []Warning
	Diagnostics    []Diagnostic
}

// Catalog discovers and validates scenarios from a filesystem rooted at the
// bundled scenarios directory.
type Catalog struct {
	files fs.FS

	mu         sync.Mutex
	discovered map[string]Descriptor
}

func NewCatalog(files fs.FS) *Catalog {
	return &Catalog{files: files}
}

// List discovers and validates every supported YAML file independently.
func (c *Catalog) List() ([]Descriptor, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	descriptors, err := c.listLocked()
	if err != nil {
		return nil, err
	}
	return cloneDescriptors(descriptors), nil
}

// Load validates and returns one scenario previously discovered by List. The
// catalog refreshes its discovery snapshot so callers cannot load arbitrary
// files that were not found under the configured filesystem root.
func (c *Catalog) Load(id string) (Scenario, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	normalized, err := normalizeID(id)
	if err != nil {
		return Scenario{}, err
	}

	_, err = c.listLocked()
	if err != nil {
		return Scenario{}, err
	}
	descriptor, exists := c.discovered[normalized]
	if !exists {
		return Scenario{}, &CatalogError{
			Code:    "scenario_not_found",
			ID:      normalized,
			Message: "the requested scenario was not discovered in the bundled scenarios directory",
		}
	}
	if descriptor.Status == StatusInvalid {
		return Scenario{}, &CatalogError{
			Code:       "scenario_invalid",
			ID:         normalized,
			Message:    "the requested scenario is invalid",
			Descriptor: &descriptor,
		}
	}

	source, err := fs.ReadFile(c.files, normalized)
	if err != nil {
		return Scenario{}, &CatalogError{
			Code:    "scenario_read_failed",
			ID:      normalized,
			Message: "the requested scenario could not be read",
			Err:     err,
		}
	}

	loaded, err := Load(normalized, source)
	if err != nil {
		return Scenario{}, &CatalogError{
			Code:       "scenario_invalid",
			ID:         normalized,
			Message:    "the requested scenario is invalid",
			Descriptor: &descriptor,
			Err:        err,
		}
	}
	return loaded, nil
}

type CatalogError struct {
	Code       string
	ID         string
	Message    string
	Descriptor *Descriptor
	Err        error
}

func (e *CatalogError) Error() string {
	if e == nil {
		return "scenario catalog error"
	}
	if e.Err == nil {
		return e.Message
	}
	return fmt.Sprintf("%s: %v", e.Message, e.Err)
}

func (e *CatalogError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func (c *Catalog) listLocked() ([]Descriptor, error) {
	if c.files == nil {
		return nil, errors.New("scenario catalog filesystem is not configured")
	}

	paths := make([]string, 0)
	err := fs.WalkDir(c.files, ".", func(currentPath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || !entry.Type().IsRegular() {
			return nil
		}
		extension := strings.ToLower(path.Ext(currentPath))
		if extension == ".yaml" || extension == ".yml" {
			paths = append(paths, currentPath)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	sort.Strings(paths)
	descriptors := make([]Descriptor, 0, len(paths))
	discovered := make(map[string]Descriptor, len(paths))
	for _, currentPath := range paths {
		id, err := normalizeID(currentPath)
		if err != nil {
			return nil, err
		}
		source, err := fs.ReadFile(c.files, id)
		if err != nil {
			descriptor := readFailureDescriptor(id, err)
			descriptors = append(descriptors, descriptor)
			discovered[id] = descriptor
			continue
		}
		descriptor := describe(id, source)
		descriptors = append(descriptors, descriptor)
		discovered[id] = descriptor
	}

	c.discovered = discovered
	return descriptors, nil
}

func readFailureDescriptor(id string, err error) Descriptor {
	return Descriptor{
		ID:             id,
		DisplayName:    displayName(id),
		RelativePath:   id,
		FolderPath:     folderPath(id),
		SourceFilename: id,
		Status:         StatusInvalid,
		Warnings:       []Warning{},
		Diagnostics: []Diagnostic{{
			Code:           "scenario_read_failed",
			Message:        "the scenario could not be read",
			Details:        err.Error(),
			SourceFilename: id,
		}},
	}
}

func describe(id string, source []byte) Descriptor {
	descriptor := Descriptor{
		ID:             id,
		DisplayName:    displayName(id),
		RelativePath:   id,
		FolderPath:     folderPath(id),
		SourceFilename: id,
		Status:         StatusInvalid,
		Warnings:       []Warning{},
		Diagnostics:    []Diagnostic{},
	}

	loaded, err := Load(id, source)
	if err != nil {
		descriptor.Diagnostics = loadDiagnostics(id, err)
		return descriptor
	}

	descriptor.DisplayName = loaded.Name
	descriptor.Status = StatusValid
	descriptor.Warnings = append([]Warning(nil), loaded.Warnings...)
	if len(loaded.Warnings) > 0 {
		descriptor.Status = StatusValidWithWarnings
	}
	return descriptor
}

func loadDiagnostics(filename string, err error) []Diagnostic {
	var loadErr *LoadError
	if !errors.As(err, &loadErr) {
		return []Diagnostic{{
			Code:           "scenario_load_failed",
			Message:        "the scenario could not be loaded",
			Details:        err.Error(),
			SourceFilename: filename,
		}}
	}

	diagnostics := make([]Diagnostic, 0, len(loadErr.Issues))
	for _, issue := range loadErr.Issues {
		details := issue.Details
		if details == "" {
			details = issue.Message
		}
		diagnostics = append(diagnostics, Diagnostic{
			Code:           issue.Code,
			Path:           issue.Path,
			Message:        issue.Message,
			Details:        details,
			SourceFilename: filename,
			Line:           issue.Line,
			Column:         issue.Column,
		})
	}
	return diagnostics
}

func normalizeID(raw string) (string, error) {
	id := strings.ReplaceAll(raw, "\\", "/")
	if id == "" || strings.HasPrefix(id, "/") {
		return "", &CatalogError{Code: "invalid_scenario_id", ID: raw, Message: "scenario IDs must be relative paths"}
	}
	if strings.Contains(strings.SplitN(id, "/", 2)[0], ":") {
		return "", &CatalogError{Code: "invalid_scenario_id", ID: raw, Message: "scenario IDs must be relative paths"}
	}
	for _, segment := range strings.Split(id, "/") {
		if segment == ".." {
			return "", &CatalogError{Code: "invalid_scenario_id", ID: raw, Message: "scenario IDs cannot contain path traversal"}
		}
	}

	cleaned := path.Clean(id)
	if cleaned == "." || cleaned == "" {
		return "", &CatalogError{Code: "invalid_scenario_id", ID: raw, Message: "scenario ID is required"}
	}
	return cleaned, nil
}

func displayName(id string) string {
	base := path.Base(id)
	extension := path.Ext(base)
	return strings.TrimSuffix(base, extension)
}

func folderPath(id string) string {
	folder := path.Dir(id)
	if folder == "." {
		return ""
	}
	return folder
}

func cloneDescriptors(source []Descriptor) []Descriptor {
	cloned := make([]Descriptor, len(source))
	for index, descriptor := range source {
		cloned[index] = descriptor
		cloned[index].Warnings = append([]Warning(nil), descriptor.Warnings...)
		cloned[index].Diagnostics = append([]Diagnostic(nil), descriptor.Diagnostics...)
	}
	return cloned
}
