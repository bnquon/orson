package scenario

import (
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
)

type FileError struct {
	Code        string
	Message     string
	Path        string
	Diagnostics []Diagnostic
	Err         error
}

func (e *FileError) Error() string {
	if e == nil {
		return "local scenario file operation failed"
	}
	if e.Err == nil {
		return e.Message
	}
	return fmt.Sprintf("%s: %v", e.Message, e.Err)
}

func (e *FileError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func (r *LocalRegistry) readFileError(normalized string, err error) *FileError {
	code := "scenario_read_failed"
	message := "the scenario file could not be read"
	if errors.Is(err, fs.ErrNotExist) {
		code = "scenario_file_missing"
		message = "the scenario file no longer exists"
	}
	return &FileError{Code: code, Message: message, Path: normalized, Err: err}
}

func localValidationError(filename string, err error) *FileError {
	code := "scenario_validation_failed"
	message := "the selected scenario configuration is invalid"
	var loadErr *LoadError
	if errors.As(err, &loadErr) && loadErr.Stage == "yaml_parse" {
		code = "scenario_parse_failed"
		message = "the selected scenario YAML could not be parsed"
	}
	return &FileError{
		Code: code, Message: message, Diagnostics: loadDiagnostics(filename, err), Err: err,
	}
}

func (r *LocalRegistry) markEntryError(entry *localEntry, err error) {
	var fileErr *FileError
	if !errors.As(err, &fileErr) {
		entry.descriptor.LocalStatus = LocalStatusUnreadable
		entry.descriptor.Diagnostics = []Diagnostic{{
			Code:           "scenario_read_failed",
			Path:           entry.normalized,
			Message:        "the scenario file could not be read",
			Details:        err.Error(),
			SourceFilename: filepath.Base(entry.normalized),
		}}
		return
	}
	switch fileErr.Code {
	case "scenario_file_missing":
		entry.descriptor.LocalStatus = LocalStatusMissing
		entry.descriptor.Diagnostics = fileErrorDiagnostics(fileErr)
	case "scenario_file_changed":
		entry.descriptor.LocalStatus = LocalStatusChanged
		entry.descriptor.Diagnostics = fileErrorDiagnostics(fileErr)
	case "scenario_parse_failed", "scenario_validation_failed":
		entry.descriptor.Status = StatusInvalid
		entry.descriptor.Warnings = nil
		entry.descriptor.Diagnostics = fileErrorDiagnostics(fileErr)
		entry.descriptor.LocalStatus = LocalStatusAvailable
	default:
		entry.descriptor.LocalStatus = LocalStatusUnreadable
		entry.descriptor.Diagnostics = fileErrorDiagnostics(fileErr)
	}
}

func fileErrorDiagnostics(fileErr *FileError) []Diagnostic {
	if len(fileErr.Diagnostics) > 0 {
		return append([]Diagnostic(nil), fileErr.Diagnostics...)
	}
	return []Diagnostic{{
		Code:           fileErr.Code,
		Path:           fileErr.Path,
		Message:        fileErr.Message,
		Details:        fileErr.Error(),
		SourceFilename: filepath.Base(fileErr.Path),
	}}
}

func changedFileError(path, detail string) *FileError {
	return &FileError{
		Code:    "scenario_file_changed",
		Message: "the scenario file changed outside Orson",
		Path:    path,
		Diagnostics: []Diagnostic{{
			Code:           "scenario_file_changed",
			Path:           path,
			Message:        "the scenario file changed outside Orson",
			Details:        detail,
			SourceFilename: filepath.Base(path),
		}},
		Err: errors.New(detail),
	}
}
