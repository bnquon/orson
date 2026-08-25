package scenario

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

// TODO: [Database] Persist imported scenario metadata across launches.
// TODO: [Workspace] Associate local scenarios with workspaces.
// TODO: [Files] Detect moved or deleted local scenario files.

type TempFile interface {
	io.Writer
	Sync() error
	Close() error
	Name() string
}

// LocalFileSystem is the narrow filesystem seam used by imported scenario
// operations. Production uses OSFileSystem; tests can inject failures without
// involving native dialogs or the user's disk.
type LocalFileSystem interface {
	ReadFile(string) ([]byte, error)
	Stat(string) (fs.FileInfo, error)
	Abs(string) (string, error)
	EvalSymlinks(string) (string, error)
	CreateTemp(string, string) (TempFile, error)
	Chmod(string, fs.FileMode) error
	Rename(string, string) error
	Remove(string) error
}

type OSFileSystem struct{}

func (OSFileSystem) ReadFile(name string) ([]byte, error)  { return os.ReadFile(name) }
func (OSFileSystem) Stat(name string) (fs.FileInfo, error) { return os.Stat(name) }
func (OSFileSystem) Abs(name string) (string, error)       { return filepath.Abs(name) }
func (OSFileSystem) EvalSymlinks(name string) (string, error) {
	return filepath.EvalSymlinks(name)
}
func (OSFileSystem) CreateTemp(dir, pattern string) (TempFile, error) {
	return os.CreateTemp(dir, pattern)
}
func (OSFileSystem) Chmod(name string, mode fs.FileMode) error { return os.Chmod(name, mode) }
func (OSFileSystem) Rename(oldPath, newPath string) error      { return os.Rename(oldPath, newPath) }
func (OSFileSystem) Remove(name string) error                  { return os.Remove(name) }

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

type localEntry struct {
	descriptor  Descriptor
	scenario    Scenario
	normalized  string
	fingerprint string
}

// LocalRegistry is the sole source of truth for imported-file identity and
// source metadata during one application process.
type LocalRegistry struct {
	mu      sync.Mutex
	files   LocalFileSystem
	entries map[string]*localEntry
	byPath  map[string]string
	order   []string
}

func NewLocalRegistry(files LocalFileSystem) *LocalRegistry {
	if files == nil {
		files = OSFileSystem{}
	}
	return &LocalRegistry{
		files:   files,
		entries: make(map[string]*localEntry),
		byPath:  make(map[string]string),
	}
}

func (r *LocalRegistry) List() []Descriptor {
	r.mu.Lock()
	defer r.mu.Unlock()

	result := make([]Descriptor, 0, len(r.order))
	for _, id := range r.order {
		if entry := r.entries[id]; entry != nil {
			result = append(result, cloneDescriptor(entry.descriptor))
		}
	}
	return result
}

func (r *LocalRegistry) Import(selectedPath string) (Descriptor, Scenario, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	normalized, key, err := r.normalizePath(selectedPath)
	if err != nil {
		return Descriptor{}, Scenario{}, err
	}

	entry := r.entryForPath(key)
	loaded, source, err := r.readScenario(normalized)
	if err != nil {
		if entry != nil {
			r.markEntryError(entry, err)
		}
		return Descriptor{}, Scenario{}, err
	}

	if entry == nil {
		id, err := newLocalID()
		if err != nil {
			return Descriptor{}, Scenario{}, &FileError{
				Code: "scenario_identity_failed", Message: "the imported scenario could not be registered", Err: err,
			}
		}
		entry = &localEntry{normalized: normalized}
		entry.descriptor.ID = id
		r.entries[id] = entry
		r.byPath[key] = id
		r.order = append(r.order, id)
	}

	r.updateEntry(entry, normalized, loaded, source)
	return cloneDescriptor(entry.descriptor), cloneScenario(entry.scenario), nil
}

func (r *LocalRegistry) Load(id string) (Descriptor, Scenario, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	entry, err := r.entry(id)
	if err != nil {
		return Descriptor{}, Scenario{}, err
	}
	loaded, source, err := r.readScenario(entry.normalized)
	if err != nil {
		r.markEntryError(entry, err)
		return Descriptor{}, Scenario{}, err
	}
	if fingerprint(source) != entry.fingerprint {
		entry.descriptor.LocalStatus = LocalStatusChanged
		return Descriptor{}, Scenario{}, &FileError{
			Code:    "scenario_file_changed",
			Message: "the scenario file changed outside Orson",
			Path:    entry.normalized,
			Err:     errors.New("import the file again to refresh the session copy"),
		}
	}
	r.updateEntry(entry, entry.normalized, loaded, source)
	return cloneDescriptor(entry.descriptor), cloneScenario(entry.scenario), nil
}

func (r *LocalRegistry) Save(id string, draft Draft) (Descriptor, Scenario, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	entry, err := r.entry(id)
	if err != nil {
		return Descriptor{}, Scenario{}, err
	}
	loaded, err := NormalizeDraft(filepath.Base(entry.normalized), draft)
	if err != nil {
		return Descriptor{}, Scenario{}, localValidationError(filepath.Base(entry.normalized), err)
	}
	source, err := MarshalCanonical(loaded)
	if err != nil {
		return Descriptor{}, Scenario{}, &FileError{
			Code: "scenario_serialize_failed", Message: "the scenario could not be serialized", Path: entry.normalized, Err: err,
		}
	}

	current, err := r.files.ReadFile(entry.normalized)
	if err != nil {
		fileErr := r.readFileError(entry.normalized, err)
		r.markEntryError(entry, fileErr)
		return Descriptor{}, Scenario{}, fileErr
	}
	if fingerprint(current) != entry.fingerprint {
		entry.descriptor.LocalStatus = LocalStatusChanged
		return Descriptor{}, Scenario{}, &FileError{
			Code:    "scenario_file_changed",
			Message: "the scenario file changed outside Orson",
			Path:    entry.normalized,
			Err:     errors.New("import the file again before saving"),
		}
	}
	if err := r.safeWrite(entry.normalized, source); err != nil {
		return Descriptor{}, Scenario{}, err
	}
	r.updateEntry(entry, entry.normalized, loaded, source)
	return cloneDescriptor(entry.descriptor), cloneScenario(entry.scenario), nil
}

func (r *LocalRegistry) SaveAs(selectedPath string, draft Draft) (Descriptor, Scenario, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	normalized, key, err := r.normalizePath(selectedPath)
	if err != nil {
		return Descriptor{}, Scenario{}, err
	}
	loaded, err := NormalizeDraft(filepath.Base(normalized), draft)
	if err != nil {
		return Descriptor{}, Scenario{}, localValidationError(filepath.Base(normalized), err)
	}
	source, err := MarshalCanonical(loaded)
	if err != nil {
		return Descriptor{}, Scenario{}, &FileError{
			Code: "scenario_serialize_failed", Message: "the scenario could not be serialized", Path: normalized, Err: err,
		}
	}
	entry := r.entryForPath(key)
	pendingID := ""
	if entry == nil {
		pendingID, err = newLocalID()
		if err != nil {
			return Descriptor{}, Scenario{}, &FileError{
				Code: "scenario_identity_failed", Message: "the saved scenario could not be registered", Err: err,
			}
		}
	}
	if err := r.safeWrite(normalized, source); err != nil {
		return Descriptor{}, Scenario{}, err
	}

	if entry == nil {
		entry = &localEntry{normalized: normalized}
		entry.descriptor.ID = pendingID
		r.entries[pendingID] = entry
		r.byPath[key] = pendingID
		r.order = append(r.order, pendingID)
	}
	r.updateEntry(entry, normalized, loaded, source)
	return cloneDescriptor(entry.descriptor), cloneScenario(entry.scenario), nil
}

func (r *LocalRegistry) normalizePath(selectedPath string) (string, string, error) {
	if strings.TrimSpace(selectedPath) == "" {
		return "", "", &FileError{Code: "scenario_path_required", Message: "a scenario filename is required"}
	}
	extension := strings.ToLower(filepath.Ext(selectedPath))
	if extension != ".yaml" && extension != ".yml" {
		return "", "", &FileError{
			Code: "unsupported_scenario_extension", Message: "scenario files must use a .yaml or .yml extension", Path: selectedPath,
		}
	}
	if strings.TrimSpace(strings.TrimSuffix(filepath.Base(selectedPath), filepath.Ext(selectedPath))) == "" {
		return "", "", &FileError{
			Code: "invalid_scenario_filename", Message: "scenario files must have a filename before the extension", Path: selectedPath,
		}
	}
	absolute, err := r.files.Abs(selectedPath)
	if err != nil {
		return "", "", &FileError{Code: "scenario_path_failed", Message: "the scenario path could not be resolved", Path: selectedPath, Err: err}
	}
	absolute = filepath.Clean(absolute)
	resolved, err := r.files.EvalSymlinks(absolute)
	if err != nil {
		if !errors.Is(err, fs.ErrNotExist) {
			return "", "", &FileError{Code: "scenario_path_failed", Message: "the scenario path could not be resolved", Path: absolute, Err: err}
		}
		parent, parentErr := r.files.EvalSymlinks(filepath.Dir(absolute))
		if parentErr == nil {
			resolved = filepath.Join(parent, filepath.Base(absolute))
		} else {
			resolved = absolute
		}
	}
	resolved = filepath.Clean(resolved)
	key := resolved
	if runtime.GOOS == "windows" {
		key = strings.ToLower(key)
	}
	return resolved, key, nil
}

func (r *LocalRegistry) readScenario(normalized string) (Scenario, []byte, error) {
	source, err := r.files.ReadFile(normalized)
	if err != nil {
		return Scenario{}, nil, r.readFileError(normalized, err)
	}
	filename := filepath.Base(normalized)
	if len(bytes.TrimSpace(source)) == 0 {
		diagnostic := Diagnostic{
			Code: "scenario_empty_file", Path: filename, Message: "the scenario YAML file is empty", Details: "Add a scenario configuration and try importing again.", SourceFilename: filename,
		}
		return Scenario{}, source, &FileError{
			Code: "scenario_validation_failed", Message: "the selected scenario configuration is invalid", Path: normalized, Diagnostics: []Diagnostic{diagnostic},
		}
	}
	loaded, err := Load(filename, source)
	if err != nil {
		return Scenario{}, source, localValidationError(filename, err)
	}
	return loaded, source, nil
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

func (r *LocalRegistry) safeWrite(target string, source []byte) (resultErr error) {
	mode := fs.FileMode(0o644)
	if info, err := r.files.Stat(target); err == nil {
		mode = info.Mode().Perm()
	} else if !errors.Is(err, fs.ErrNotExist) {
		return &FileError{Code: "scenario_write_failed", Message: "the scenario file could not be inspected before saving", Path: target, Err: err}
	}

	temporary, err := r.files.CreateTemp(filepath.Dir(target), ".orson-scenario-*")
	if err != nil {
		return &FileError{Code: "scenario_write_failed", Message: "the scenario file could not be prepared for saving", Path: target, Err: err}
	}
	temporaryPath := temporary.Name()
	committed := false
	defer func() {
		if committed {
			return
		}
		if cleanupErr := r.files.Remove(temporaryPath); cleanupErr != nil && !errors.Is(cleanupErr, fs.ErrNotExist) && resultErr == nil {
			resultErr = &FileError{Code: "scenario_write_failed", Message: "the temporary scenario file could not be cleaned up", Path: target, Err: cleanupErr}
		}
	}()

	if _, err := temporary.Write(source); err != nil {
		_ = temporary.Close()
		return &FileError{Code: "scenario_write_failed", Message: "the scenario file could not be written", Path: target, Err: err}
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return &FileError{Code: "scenario_write_failed", Message: "the scenario file could not be safely flushed", Path: target, Err: err}
	}
	if err := r.files.Chmod(temporaryPath, mode); err != nil {
		_ = temporary.Close()
		return &FileError{Code: "scenario_write_failed", Message: "the scenario file permissions could not be preserved", Path: target, Err: err}
	}
	if err := temporary.Close(); err != nil {
		return &FileError{Code: "scenario_write_failed", Message: "the scenario file could not be closed before saving", Path: target, Err: err}
	}
	if err := r.files.Rename(temporaryPath, target); err != nil {
		return &FileError{Code: "scenario_write_failed", Message: "the scenario file could not replace the selected file", Path: target, Err: err}
	}
	committed = true
	return nil
}

func (r *LocalRegistry) updateEntry(entry *localEntry, normalized string, loaded Scenario, source []byte) {
	filename := filepath.Base(normalized)
	status := StatusValid
	if len(loaded.Warnings) > 0 {
		status = StatusValidWithWarnings
	}
	entry.normalized = normalized
	entry.scenario = cloneScenario(loaded)
	entry.fingerprint = fingerprint(source)
	entry.descriptor = Descriptor{
		ID:             entry.descriptor.ID,
		DisplayName:    filename,
		RelativePath:   filename,
		SourceFilename: filename,
		Source:         SourceLocal,
		SourcePath:     normalized,
		LocalStatus:    LocalStatusAvailable,
		Status:         status,
		Warnings:       append([]Warning(nil), loaded.Warnings...),
		Diagnostics:    []Diagnostic{},
	}
}

func (r *LocalRegistry) markEntryError(entry *localEntry, err error) {
	var fileErr *FileError
	if !errors.As(err, &fileErr) {
		entry.descriptor.LocalStatus = LocalStatusUnreadable
		return
	}
	switch fileErr.Code {
	case "scenario_file_missing":
		entry.descriptor.LocalStatus = LocalStatusMissing
	case "scenario_file_changed":
		entry.descriptor.LocalStatus = LocalStatusChanged
	case "scenario_parse_failed", "scenario_validation_failed":
		entry.descriptor.Status = StatusInvalid
		entry.descriptor.Warnings = nil
		entry.descriptor.Diagnostics = append([]Diagnostic(nil), fileErr.Diagnostics...)
		entry.descriptor.LocalStatus = LocalStatusAvailable
	default:
		entry.descriptor.LocalStatus = LocalStatusUnreadable
	}
}

func (r *LocalRegistry) entry(id string) (*localEntry, error) {
	entry := r.entries[strings.TrimSpace(id)]
	if entry == nil {
		return nil, &FileError{Code: "local_scenario_not_found", Message: "that imported scenario is no longer available in this session"}
	}
	return entry, nil
}

func (r *LocalRegistry) entryForPath(key string) *localEntry {
	return r.entries[r.byPath[key]]
}

func newLocalID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return "local:" + hex.EncodeToString(buffer), nil
}

func fingerprint(source []byte) string {
	sum := sha256.Sum256(source)
	return hex.EncodeToString(sum[:])
}

func cloneDescriptor(source Descriptor) Descriptor {
	source.Warnings = append([]Warning(nil), source.Warnings...)
	source.Diagnostics = append([]Diagnostic(nil), source.Diagnostics...)
	return source
}

func cloneScenario(source Scenario) Scenario {
	source.Headers = append([]Header(nil), source.Headers...)
	source.WatchedTopics = append([]string(nil), source.WatchedTopics...)
	source.Topology = append([]TopologyEdge(nil), source.Topology...)
	source.ConfiguredTopology = append([]TopologyEdge(nil), source.ConfiguredTopology...)
	source.Warnings = append([]Warning(nil), source.Warnings...)
	return source
}
