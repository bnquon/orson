package scenario

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"path/filepath"
	"strings"
	"sync"
)

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

// Hydrate registers a durable file reference for this process. The persisted
// fingerprint remains the baseline so externally changed files are surfaced
// instead of silently replacing a previous workspace selection.
func (r *LocalRegistry) Hydrate(selectedPath, expectedFingerprint string) (Descriptor, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	normalized, key, err := r.normalizePath(selectedPath)
	if err != nil {
		return Descriptor{}, err
	}
	entry := r.entryForPath(key)
	if entry == nil {
		id, identityErr := newLocalID()
		if identityErr != nil {
			return Descriptor{}, &FileError{Code: "scenario_identity_failed", Message: "the imported scenario could not be registered", Err: identityErr}
		}
		filename := filepath.Base(normalized)
		entry = &localEntry{
			normalized: normalized,
			descriptor: Descriptor{
				ID:             id,
				DisplayName:    filename,
				RelativePath:   filename,
				SourceFilename: filename,
				Source:         SourceLocal,
				SourcePath:     normalized,
				Status:         StatusInvalid,
			},
		}
		r.entries[id] = entry
		r.byPath[key] = id
		r.order = append(r.order, id)
	}

	loaded, source, readErr := r.readScenario(normalized)
	if readErr != nil {
		r.markEntryError(entry, readErr)
		if len(entry.descriptor.Diagnostics) == 0 {
			var fileErr *FileError
			_ = errors.As(readErr, &fileErr)
			code := "scenario_read_failed"
			message := "The scenario file could not be read."
			if fileErr != nil {
				code = fileErr.Code
				message = fileErr.Message
			}
			entry.descriptor.Diagnostics = []Diagnostic{{Code: code, Path: normalized, Message: message, Details: readErr.Error(), SourceFilename: filepath.Base(normalized)}}
		}
		entry.fingerprint = expectedFingerprint
		return cloneDescriptor(entry.descriptor), readErr
	}

	currentFingerprint := fingerprint(source)
	r.updateEntry(entry, normalized, loaded, source)
	if expectedFingerprint != "" && expectedFingerprint != currentFingerprint {
		changed := changedFileError(normalized, "import the file again to refresh the session copy")
		entry.fingerprint = expectedFingerprint
		entry.descriptor.LocalStatus = LocalStatusChanged
		entry.descriptor.Diagnostics = append([]Diagnostic(nil), changed.Diagnostics...)
	}
	return cloneDescriptor(entry.descriptor), nil
}

type LocalReference struct {
	CanonicalPath string
	Fingerprint   string
}

func (r *LocalRegistry) Reference(id string) (LocalReference, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	entry, err := r.entry(id)
	if err != nil {
		return LocalReference{}, err
	}
	return LocalReference{CanonicalPath: entry.normalized, Fingerprint: entry.fingerprint}, nil
}

// Remove unregisters an imported file from this process without touching the
// file on disk.
func (r *LocalRegistry) Remove(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	return r.removeLocked(strings.TrimSpace(id))
}

// RemovePath unregisters an imported file by canonical path without touching
// the file on disk. It is used when workspace metadata removes a reference
// after a folder operation.
func (r *LocalRegistry) RemovePath(path string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	_, key, err := r.normalizePath(path)
	if err != nil {
		return err
	}
	id, exists := r.byPath[key]
	if !exists {
		return nil
	}
	return r.removeLocked(id)
}

func (r *LocalRegistry) removeLocked(id string) error {
	if _, err := r.entry(id); err != nil {
		return err
	}
	delete(r.entries, id)
	for path, registeredID := range r.byPath {
		if registeredID == id {
			delete(r.byPath, path)
		}
	}
	for index, registeredID := range r.order {
		if registeredID == id {
			r.order = append(r.order[:index], r.order[index+1:]...)
			break
		}
	}
	return nil
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
		changed := changedFileError(entry.normalized, "import the file again to refresh the session copy")
		entry.descriptor.Diagnostics = append([]Diagnostic(nil), changed.Diagnostics...)
		return Descriptor{}, Scenario{}, changed
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
	loaded, source, err := CanonicalizeDraft(filepath.Base(entry.normalized), draft)
	if err != nil {
		var loadErr *LoadError
		if errors.As(err, &loadErr) {
			return Descriptor{}, Scenario{}, localValidationError(filepath.Base(entry.normalized), err)
		}
		return Descriptor{}, Scenario{}, &FileError{
			Code: "scenario_serialize_failed", Message: "the scenario could not be serialized", Path: entry.normalized, Err: err,
		}
	}

	if err := r.verifyFingerprint(entry.normalized, entry.fingerprint); err != nil {
		r.markEntryError(entry, err)
		return Descriptor{}, Scenario{}, err
	}
	if err := r.safeWrite(entry.normalized, source, entry.fingerprint); err != nil {
		var fileErr *FileError
		if errors.As(err, &fileErr) {
			switch fileErr.Code {
			case "scenario_file_changed", "scenario_file_missing", "scenario_read_failed":
				r.markEntryError(entry, err)
			}
		}
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
	if err := r.rejectSymlinkSaveTarget(selectedPath); err != nil {
		return Descriptor{}, Scenario{}, err
	}
	loaded, source, err := CanonicalizeDraft(filepath.Base(normalized), draft)
	if err != nil {
		var loadErr *LoadError
		if errors.As(err, &loadErr) {
			return Descriptor{}, Scenario{}, localValidationError(filepath.Base(normalized), err)
		}
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
	if err := r.safeWrite(normalized, source, ""); err != nil {
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
