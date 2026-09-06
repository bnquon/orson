package scenario

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

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
	Lstat(string) (fs.FileInfo, error)
	Abs(string) (string, error)
	EvalSymlinks(string) (string, error)
	CreateTemp(string, string) (TempFile, error)
	Chmod(string, fs.FileMode) error
	Rename(string, string) error
	Remove(string) error
}

type OSFileSystem struct{}

func (OSFileSystem) ReadFile(name string) ([]byte, error)   { return os.ReadFile(name) }
func (OSFileSystem) Stat(name string) (fs.FileInfo, error)  { return os.Stat(name) }
func (OSFileSystem) Lstat(name string) (fs.FileInfo, error) { return os.Lstat(name) }
func (OSFileSystem) Abs(name string) (string, error)        { return filepath.Abs(name) }
func (OSFileSystem) EvalSymlinks(name string) (string, error) {
	return filepath.EvalSymlinks(name)
}
func (OSFileSystem) CreateTemp(dir, pattern string) (TempFile, error) {
	return os.CreateTemp(dir, pattern)
}
func (OSFileSystem) Chmod(name string, mode fs.FileMode) error { return os.Chmod(name, mode) }
func (OSFileSystem) Rename(oldPath, newPath string) error      { return os.Rename(oldPath, newPath) }
func (OSFileSystem) Remove(name string) error                  { return os.Remove(name) }

func (r *LocalRegistry) rejectSymlinkSaveTarget(selectedPath string) error {
	absolute, err := r.files.Abs(selectedPath)
	if err != nil {
		return &FileError{Code: "scenario_path_failed", Message: "the scenario path could not be resolved", Path: selectedPath, Err: err}
	}
	absolute = filepath.Clean(absolute)
	info, err := r.files.Lstat(absolute)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return &FileError{Code: "scenario_path_failed", Message: "the scenario path could not be inspected", Path: absolute, Err: err}
	}
	if info.Mode()&fs.ModeSymlink != 0 {
		return &FileError{
			Code:    "scenario_symlink_target_unsupported",
			Message: "scenario files cannot be saved through a symbolic link",
			Path:    absolute,
			Err:     errors.New("choose a regular YAML file instead"),
		}
	}
	return nil
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

func (r *LocalRegistry) verifyFingerprint(target, expected string) error {
	current, err := r.files.ReadFile(target)
	if err != nil {
		return r.readFileError(target, err)
	}
	if fingerprint(current) != expected {
		return changedFileError(target, "import the file again before saving")
	}
	return nil
}

func (r *LocalRegistry) safeWrite(target string, source []byte, expectedFingerprint string) (resultErr error) {
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
	// Recheck immediately before committing so an edit made while the temporary
	// file was prepared is not silently overwritten.
	// TODO: [Files] Add platform-specific compare-and-swap support if stronger save conflict guarantees become necessary.
	if expectedFingerprint != "" {
		if err := r.verifyFingerprint(target, expectedFingerprint); err != nil {
			return err
		}
	}
	if err := r.files.Rename(temporaryPath, target); err != nil {
		return &FileError{Code: "scenario_write_failed", Message: "the scenario file could not replace the selected file", Path: target, Err: err}
	}
	committed = true
	return nil
}

func fingerprint(source []byte) string {
	sum := sha256.Sum256(source)
	return hex.EncodeToString(sum[:])
}
