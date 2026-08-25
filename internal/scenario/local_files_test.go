package scenario

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestLocalRegistryImportsExternalFileAndDeduplicatesNormalizedPath(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "imported-order.yaml")
	writeTestScenario(t, path, validCatalogYAML("imported order"))
	registry := NewLocalRegistry(nil)

	firstDescriptor, firstScenario, err := registry.Import(path)
	if err != nil {
		t.Fatalf("Import() failed: %v", err)
	}
	secondDescriptor, _, err := registry.Import(filepath.Join(directory, ".", "imported-order.yaml"))
	if err != nil {
		t.Fatalf("duplicate Import() failed: %v", err)
	}
	if firstDescriptor.ID == "" || firstDescriptor.ID != secondDescriptor.ID {
		t.Fatalf("duplicate IDs = %q / %q, want same opaque ID", firstDescriptor.ID, secondDescriptor.ID)
	}
	if !strings.HasPrefix(firstDescriptor.ID, "local:") {
		t.Fatalf("ID = %q, want opaque local ID", firstDescriptor.ID)
	}
	if firstDescriptor.DisplayName != "imported-order.yaml" || firstDescriptor.SourceFilename != "imported-order.yaml" {
		t.Fatalf("descriptor labels = %+v, want filename only", firstDescriptor)
	}
	if filepath.Base(firstDescriptor.SourcePath) != filepath.Base(path) || firstDescriptor.Source != SourceLocal || firstDescriptor.LocalStatus != LocalStatusAvailable {
		t.Fatalf("descriptor source = %+v, want available local path", firstDescriptor)
	}
	if firstScenario.Name != "imported order" {
		t.Fatalf("scenario name = %q, want imported order", firstScenario.Name)
	}
	if got := len(registry.List()); got != 1 {
		t.Fatalf("registry count = %d, want deduplicated 1", got)
	}
}

func TestLocalRegistryDeduplicatesSymlinkedPath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink permissions vary on Windows")
	}
	directory := t.TempDir()
	target := filepath.Join(directory, "target.yaml")
	link := filepath.Join(directory, "alias.yaml")
	writeTestScenario(t, target, validCatalogYAML("symlink"))
	if err := os.Symlink(target, link); err != nil {
		t.Fatalf("Symlink() failed: %v", err)
	}
	registry := NewLocalRegistry(nil)
	first, _, err := registry.Import(target)
	if err != nil {
		t.Fatalf("Import(target) failed: %v", err)
	}
	second, _, err := registry.Import(link)
	if err != nil {
		t.Fatalf("Import(link) failed: %v", err)
	}
	if first.ID != second.ID || len(registry.List()) != 1 {
		t.Fatalf("symlink import created duplicate entries: %+v", registry.List())
	}
}

func TestLocalRegistryRejectsInvalidEmptyAndUnsupportedFilesWithoutRegistering(t *testing.T) {
	directory := t.TempDir()
	tests := []struct {
		name    string
		content string
		code    string
	}{
		{name: "broken.yaml", content: "name: [", code: "scenario_parse_failed"},
		{name: "unknown.yaml", content: strings.Replace(validCatalogYAML("unknown"), "name: unknown", "name: unknown\nextra: true", 1), code: "scenario_parse_failed"},
		{name: "empty.yml", content: " \n", code: "scenario_validation_failed"},
		{name: ".yaml", content: validCatalogYAML("missing stem"), code: "invalid_scenario_filename"},
		{name: "unsupported.json", content: "{}", code: "unsupported_scenario_extension"},
	}
	registry := NewLocalRegistry(nil)
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(directory, test.name)
			writeTestScenario(t, path, test.content)
			_, _, err := registry.Import(path)
			var fileErr *FileError
			if !errors.As(err, &fileErr) || fileErr.Code != test.code {
				t.Fatalf("Import() error = %#v, want FileError code %q", err, test.code)
			}
			if (test.code == "scenario_parse_failed" || test.code == "scenario_validation_failed") && len(fileErr.Diagnostics) == 0 {
				t.Fatalf("Import() diagnostics = %+v, want source diagnostics", fileErr.Diagnostics)
			}
		})
	}
	if got := len(registry.List()); got != 0 {
		t.Fatalf("invalid imports registered %d entries, want 0", got)
	}
}

func TestLocalRegistryRejectsMissingAndUnreadableFirstImportsWithoutRegistering(t *testing.T) {
	directory := t.TempDir()
	missingPath := filepath.Join(directory, "missing.yaml")
	registry := NewLocalRegistry(nil)
	_, _, err := registry.Import(missingPath)
	assertFileErrorCode(t, err, "scenario_file_missing")
	if len(registry.List()) != 0 {
		t.Fatalf("missing first import registered an entry: %+v", registry.List())
	}

	unreadablePath := filepath.Join(directory, "unreadable.yaml")
	writeTestScenario(t, unreadablePath, validCatalogYAML("unreadable"))
	registry = NewLocalRegistry(&failureLocalFileSystem{
		OSFileSystem: OSFileSystem{},
		readErr:      fs.ErrPermission,
	})
	_, _, err = registry.Import(unreadablePath)
	assertFileErrorCode(t, err, "scenario_read_failed")
	if len(registry.List()) != 0 {
		t.Fatalf("unreadable first import registered an entry: %+v", registry.List())
	}
}

func TestLocalRegistrySavePreservesWarningBearingConfiguredTopology(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "warning-heavy.yaml")
	source, err := testFixtures.ReadFile("testdata/topology-warnings.yaml")
	if err != nil {
		t.Fatalf("ReadFile(fixture) failed: %v", err)
	}
	writeTestScenario(t, path, string(source))
	registry := NewLocalRegistry(nil)
	descriptor, imported, err := registry.Import(path)
	if err != nil {
		t.Fatalf("Import() failed: %v", err)
	}

	draft := Draft{
		Name:              imported.Name,
		PublishTopic:      imported.PublishTopic,
		PublishPayload:    `{"edited":true}`,
		MessageKey:        imported.MessageKey,
		Headers:           imported.Headers,
		WatchedTopics:     imported.WatchedTopics,
		CorrelationHeader: imported.CorrelationHeader,
		CaptureTimeout:    imported.CaptureTimeout,
		Topology:          imported.ConfiguredTopology,
	}
	_, saved, err := registry.Save(descriptor.ID, draft)
	if err != nil {
		t.Fatalf("Save() failed: %v", err)
	}
	if len(saved.ConfiguredTopology) != 6 || len(saved.Warnings) != 4 {
		t.Fatalf("saved warning topology = %d configured / %d warnings, want 6 / 4", len(saved.ConfiguredTopology), len(saved.Warnings))
	}
	reloadedSource, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(saved) failed: %v", err)
	}
	reloaded, err := Load(filepath.Base(path), reloadedSource)
	if err != nil {
		t.Fatalf("Load(saved) failed: %v", err)
	}
	for index, edge := range imported.ConfiguredTopology {
		if reloaded.ConfiguredTopology[index].From != edge.From || reloaded.ConfiguredTopology[index].To != edge.To {
			t.Fatalf("configured topology changed at %d: %+v / %+v", index, edge, reloaded.ConfiguredTopology[index])
		}
	}
}

func TestLocalRegistrySaveRoundTripsDraftAndPreservesListOrder(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "editable.yaml")
	writeTestScenario(t, path, validCatalogYAML("editable"))
	registry := NewLocalRegistry(nil)
	descriptor, _, err := registry.Import(path)
	if err != nil {
		t.Fatalf("Import() failed: %v", err)
	}

	draft := orderedLocalDraft()
	savedDescriptor, saved, err := registry.Save(descriptor.ID, draft)
	if err != nil {
		t.Fatalf("Save() failed: %v", err)
	}
	if savedDescriptor.ID != descriptor.ID || saved.MessageKey != "key-9" {
		t.Fatalf("saved identity/data = %+v / %+v", savedDescriptor, saved)
	}
	source, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(saved) failed: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat(saved) failed: %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("saved permissions = %o, want imported 600", info.Mode().Perm())
	}
	if !(strings.Index(string(source), "x-zeta") < strings.Index(string(source), "x-alpha")) {
		t.Fatalf("saved headers were sorted:\n%s", source)
	}
	roundTripped, err := Load(filepath.Base(path), source)
	if err != nil {
		t.Fatalf("Load(saved) failed: %v", err)
	}
	if strings.Join(roundTripped.WatchedTopics, ",") != "topic.z,topic.a" {
		t.Fatalf("watch order = %+v, want configured order", roundTripped.WatchedTopics)
	}
	if roundTripped.Topology[0].To != "topic.z" || roundTripped.Topology[1].To != "topic.a" {
		t.Fatalf("topology order = %+v, want configured order", roundTripped.Topology)
	}
}

func TestLocalRegistryRefusesSaveAfterExternalChangeAndKeepsFingerprint(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "changed.yaml")
	writeTestScenario(t, path, validCatalogYAML("changed"))
	registry := NewLocalRegistry(nil)
	descriptor, _, err := registry.Import(path)
	if err != nil {
		t.Fatalf("Import() failed: %v", err)
	}
	external := strings.Replace(validCatalogYAML("changed"), "orderId: ord_1", "orderId: external", 1)
	writeTestScenario(t, path, external)

	_, _, err = registry.Save(descriptor.ID, orderedLocalDraft())
	var fileErr *FileError
	if !errors.As(err, &fileErr) || fileErr.Code != "scenario_file_changed" {
		t.Fatalf("Save() error = %#v, want scenario_file_changed", err)
	}
	current, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile() failed: %v", err)
	}
	if string(current) != external {
		t.Fatalf("external file was overwritten:\n%s", current)
	}
	if registry.List()[0].LocalStatus != LocalStatusChanged {
		t.Fatalf("LocalStatus = %q, want changed", registry.List()[0].LocalStatus)
	}
}

func TestLocalRegistryRefusesLoadAfterExternalChangeAndKeepsStoredScenario(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "changed-on-load.yaml")
	writeTestScenario(t, path, validCatalogYAML("original"))
	registry := NewLocalRegistry(nil)
	descriptor, _, err := registry.Import(path)
	if err != nil {
		t.Fatalf("Import() failed: %v", err)
	}
	writeTestScenario(t, path, validCatalogYAML("external"))

	_, _, err = registry.Load(descriptor.ID)
	assertFileErrorCode(t, err, "scenario_file_changed")
	if registry.List()[0].LocalStatus != LocalStatusChanged {
		t.Fatalf("LocalStatus = %q, want changed", registry.List()[0].LocalStatus)
	}
	if got := registry.entries[descriptor.ID].scenario.Name; got != "original" {
		t.Fatalf("stored scenario = %q, want original", got)
	}
}

func TestDuplicateImportRefreshesValidationMetadataWithoutReplacingStoredScenario(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "refresh.yaml")
	writeTestScenario(t, path, validCatalogYAML("original"))
	registry := NewLocalRegistry(nil)
	descriptor, _, err := registry.Import(path)
	if err != nil {
		t.Fatalf("Import(valid) failed: %v", err)
	}
	writeTestScenario(t, path, "name: [")
	if _, _, err := registry.Import(path); err == nil {
		t.Fatal("Import(invalid refresh) returned nil error")
	}
	listed := registry.List()
	if len(listed) != 1 || listed[0].ID != descriptor.ID || listed[0].Status != StatusInvalid || listed[0].LocalStatus != LocalStatusAvailable {
		t.Fatalf("refreshed descriptor = %+v, want same invalid/available entry", listed)
	}
	if len(listed[0].Diagnostics) == 0 || listed[0].Diagnostics[0].SourceFilename != "refresh.yaml" {
		t.Fatalf("refreshed diagnostics = %+v", listed[0].Diagnostics)
	}
	if registry.entries[descriptor.ID].scenario.Name != "original" {
		t.Fatalf("stored active-safe scenario = %q, want original", registry.entries[descriptor.ID].scenario.Name)
	}
}

func TestLocalRegistrySaveAsRegistersNewActiveSourceOnlyAfterWrite(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(directory, "copy.yaml")
	registry := NewLocalRegistry(nil)
	descriptor, loaded, err := registry.SaveAs(target, orderedLocalDraft())
	if err != nil {
		t.Fatalf("SaveAs() failed: %v", err)
	}
	if filepath.Base(descriptor.SourcePath) != "copy.yaml" || descriptor.SourceFilename != "copy.yaml" || loaded.SourceFilename != "copy.yaml" {
		t.Fatalf("saved source = %+v / %+v, want copy.yaml", descriptor, loaded)
	}
	if len(registry.List()) != 1 {
		t.Fatalf("registry count = %d, want 1", len(registry.List()))
	}

	failing := NewLocalRegistry(createTempFailureFS{OSFileSystem: OSFileSystem{}, Err: fs.ErrPermission})
	_, _, err = failing.SaveAs(filepath.Join(directory, "denied.yaml"), orderedLocalDraft())
	var fileErr *FileError
	if !errors.As(err, &fileErr) || fileErr.Code != "scenario_write_failed" {
		t.Fatalf("SaveAs(failure) = %#v, want scenario_write_failed", err)
	}
	if len(failing.List()) != 0 {
		t.Fatalf("failed SaveAs registered source: %+v", failing.List())
	}
}

func TestLocalRegistryMarksMissingImportedFileWithoutRemovingSessionEntry(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "missing.yaml")
	writeTestScenario(t, path, validCatalogYAML("missing"))
	registry := NewLocalRegistry(nil)
	descriptor, _, err := registry.Import(path)
	if err != nil {
		t.Fatalf("Import() failed: %v", err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("Remove() failed: %v", err)
	}
	_, _, err = registry.Load(descriptor.ID)
	var fileErr *FileError
	if !errors.As(err, &fileErr) || fileErr.Code != "scenario_file_missing" {
		t.Fatalf("Load(missing) = %#v, want scenario_file_missing", err)
	}
	listed := registry.List()
	if len(listed) != 1 || listed[0].LocalStatus != LocalStatusMissing {
		t.Fatalf("missing session entry = %+v", listed)
	}
}

func TestSafeWriteReportsEveryInjectedFilesystemStage(t *testing.T) {
	tests := []struct {
		name        string
		configure   func(*failureLocalFileSystem)
		wantMessage string
	}{
		{name: "stat", configure: func(files *failureLocalFileSystem) { files.statErr = fs.ErrPermission }, wantMessage: "inspected"},
		{name: "create temp", configure: func(files *failureLocalFileSystem) { files.createTempErr = fs.ErrPermission }, wantMessage: "prepared"},
		{name: "write", configure: func(files *failureLocalFileSystem) { files.writeErr = fs.ErrPermission }, wantMessage: "written"},
		{name: "sync", configure: func(files *failureLocalFileSystem) { files.syncErr = fs.ErrPermission }, wantMessage: "flushed"},
		{name: "chmod", configure: func(files *failureLocalFileSystem) { files.chmodErr = fs.ErrPermission }, wantMessage: "permissions"},
		{name: "close", configure: func(files *failureLocalFileSystem) { files.closeErr = fs.ErrPermission }, wantMessage: "closed"},
		{name: "rename", configure: func(files *failureLocalFileSystem) { files.renameErr = fs.ErrPermission }, wantMessage: "replace"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			directory := t.TempDir()
			target := filepath.Join(directory, "target.yaml")
			writeTestScenario(t, target, validCatalogYAML("original"))
			files := &failureLocalFileSystem{OSFileSystem: OSFileSystem{}}
			test.configure(files)
			registry := NewLocalRegistry(files)

			err := registry.safeWrite(target, []byte(validCatalogYAML("replacement")))
			fileErr := assertFileErrorCode(t, err, "scenario_write_failed")
			if !strings.Contains(fileErr.Message, test.wantMessage) {
				t.Fatalf("safeWrite() message = %q, want stage containing %q", fileErr.Message, test.wantMessage)
			}
		})
	}
}

func TestSafeWriteDoesNotFailAfterRenameCommits(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(directory, "target.yaml")
	writeTestScenario(t, target, validCatalogYAML("original"))
	files := &failureLocalFileSystem{OSFileSystem: OSFileSystem{}, removeErr: fs.ErrPermission}
	registry := NewLocalRegistry(files)
	replacement := []byte(validCatalogYAML("replacement"))

	if err := registry.safeWrite(target, replacement); err != nil {
		t.Fatalf("safeWrite() reported failure after rename committed: %v", err)
	}
	written, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("ReadFile() failed: %v", err)
	}
	if string(written) != string(replacement) {
		t.Fatalf("saved source = %q, want committed replacement", written)
	}
}

type createTempFailureFS struct {
	OSFileSystem
	Err error
}

func (f createTempFailureFS) CreateTemp(string, string) (TempFile, error) {
	return nil, f.Err
}

type failureLocalFileSystem struct {
	OSFileSystem
	readErr       error
	statErr       error
	createTempErr error
	writeErr      error
	syncErr       error
	chmodErr      error
	closeErr      error
	renameErr     error
	removeErr     error
}

func (f *failureLocalFileSystem) ReadFile(name string) ([]byte, error) {
	if f.readErr != nil {
		return nil, f.readErr
	}
	return f.OSFileSystem.ReadFile(name)
}

func (f *failureLocalFileSystem) Stat(name string) (fs.FileInfo, error) {
	if f.statErr != nil {
		return nil, f.statErr
	}
	return f.OSFileSystem.Stat(name)
}

func (f *failureLocalFileSystem) CreateTemp(dir, pattern string) (TempFile, error) {
	if f.createTempErr != nil {
		return nil, f.createTempErr
	}
	temporary, err := f.OSFileSystem.CreateTemp(dir, pattern)
	if err != nil {
		return nil, err
	}
	return &failureTempFile{
		TempFile: temporary,
		writeErr: f.writeErr,
		syncErr:  f.syncErr,
		closeErr: f.closeErr,
	}, nil
}

func (f *failureLocalFileSystem) Chmod(name string, mode fs.FileMode) error {
	if f.chmodErr != nil {
		return f.chmodErr
	}
	return f.OSFileSystem.Chmod(name, mode)
}

func (f *failureLocalFileSystem) Rename(oldPath, newPath string) error {
	if f.renameErr != nil {
		return f.renameErr
	}
	return f.OSFileSystem.Rename(oldPath, newPath)
}

func (f *failureLocalFileSystem) Remove(name string) error {
	err := f.OSFileSystem.Remove(name)
	if f.removeErr != nil {
		return f.removeErr
	}
	return err
}

type failureTempFile struct {
	TempFile
	writeErr error
	syncErr  error
	closeErr error
}

func (f *failureTempFile) Write(source []byte) (int, error) {
	if f.writeErr != nil {
		return 0, f.writeErr
	}
	return f.TempFile.Write(source)
}

func (f *failureTempFile) Sync() error {
	if f.syncErr != nil {
		return f.syncErr
	}
	return f.TempFile.Sync()
}

func (f *failureTempFile) Close() error {
	err := f.TempFile.Close()
	if f.closeErr != nil {
		return f.closeErr
	}
	return err
}

func assertFileErrorCode(t *testing.T, err error, code string) *FileError {
	t.Helper()
	var fileErr *FileError
	if !errors.As(err, &fileErr) || fileErr.Code != code {
		t.Fatalf("error = %#v, want FileError code %q", err, code)
	}
	return fileErr
}

func orderedLocalDraft() Draft {
	return Draft{
		Name:           "saved local",
		PublishTopic:   "root",
		PublishPayload: `{"orderId":"ord_saved"}`,
		MessageKey:     "key-9",
		Headers: []Header{
			{Key: "x-zeta", Value: "z"},
			{Key: "x-alpha", Value: "a"},
		},
		WatchedTopics:     []string{"topic.z", "topic.a"},
		CorrelationHeader: "x-flow-id",
		CaptureTimeout:    9 * time.Second,
		Topology: []TopologyEdge{
			{From: "root", To: "topic.z"},
			{From: "root", To: "topic.a"},
		},
	}
}

func writeTestScenario(t *testing.T, path, source string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(source), 0o600); err != nil {
		t.Fatalf("WriteFile(%q) failed: %v", path, err)
	}
}
