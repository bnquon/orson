package scenario

import (
	"errors"
	"io/fs"
	"strings"
	"testing"
	"testing/fstest"
)

func TestCatalogDiscoversAndSortsSupportedFiles(t *testing.T) {
	catalog := NewCatalog(fstest.MapFS{
		"z-last.yaml":        mapFile(validCatalogYAML("z-last")),
		"checkout/b.yml":     mapFile(validCatalogYAML("b")),
		"checkout/a.yaml":    mapFile(validCatalogYAML("a")),
		"checkout/readme.md": mapFile("ignored"),
		"notes.yml.txt":      mapFile("ignored"),
	})

	descriptors, err := catalog.List()
	if err != nil {
		t.Fatalf("List() failed: %v", err)
	}

	ids := make([]string, 0, len(descriptors))
	for _, descriptor := range descriptors {
		ids = append(ids, descriptor.ID)
	}
	if got, want := strings.Join(ids, ","), "checkout/a.yaml,checkout/b.yml,z-last.yaml"; got != want {
		t.Fatalf("IDs = %q, want %q", got, want)
	}
	if descriptors[0].FolderPath != "checkout" {
		t.Fatalf("FolderPath = %q, want checkout", descriptors[0].FolderPath)
	}
	if descriptors[0].Status != StatusValid {
		t.Fatalf("Status = %q, want valid", descriptors[0].Status)
	}
}

func TestCatalogUsesFilenameFallbackAndKeepsInvalidFiles(t *testing.T) {
	catalog := NewCatalog(fstest.MapFS{
		"missing-name.yaml": mapFile(strings.Replace(validCatalogYAML("fallback"), "name: fallback\n", "", 1)),
		"broken.yaml":       mapFile("name: ["),
		"valid.yml":         mapFile(validCatalogYAML("valid")),
	})

	descriptors, err := catalog.List()
	if err != nil {
		t.Fatalf("List() failed: %v", err)
	}
	if len(descriptors) != 3 {
		t.Fatalf("descriptor count = %d, want 3", len(descriptors))
	}

	byID := make(map[string]Descriptor, len(descriptors))
	for _, descriptor := range descriptors {
		byID[descriptor.ID] = descriptor
	}
	if byID["missing-name.yaml"].DisplayName != "missing-name" {
		t.Fatalf("fallback display name = %q, want missing-name", byID["missing-name.yaml"].DisplayName)
	}
	if byID["broken.yaml"].Status != StatusInvalid {
		t.Fatalf("broken status = %q, want invalid", byID["broken.yaml"].Status)
	}
	if len(byID["broken.yaml"].Diagnostics) == 0 || byID["broken.yaml"].Diagnostics[0].SourceFilename != "broken.yaml" {
		t.Fatalf("broken diagnostics = %+v, want source filename", byID["broken.yaml"].Diagnostics)
	}
	if byID["valid.yml"].Status != StatusValid {
		t.Fatalf("valid status = %q, want valid", byID["valid.yml"].Status)
	}
}

func TestCatalogKeepsListingWhenOneFileCannotBeRead(t *testing.T) {
	base := fstest.MapFS{
		"broken.yaml": mapFile(validCatalogYAML("broken")),
		"valid.yaml":  mapFile(validCatalogYAML("valid")),
	}
	catalog := NewCatalog(readFailureFS{
		FS:       base,
		Failures: map[string]error{"broken.yaml": errors.New("permission denied")},
	})

	descriptors, err := catalog.List()
	if err != nil {
		t.Fatalf("List() failed: %v", err)
	}
	if len(descriptors) != 2 {
		t.Fatalf("descriptor count = %d, want 2", len(descriptors))
	}

	if descriptors[0].ID != "broken.yaml" || descriptors[0].Status != StatusInvalid {
		t.Fatalf("read-failed descriptor = %+v, want invalid broken.yaml descriptor", descriptors[0])
	}
	if len(descriptors[0].Diagnostics) != 1 {
		t.Fatalf("read-failed diagnostics = %+v, want one diagnostic", descriptors[0].Diagnostics)
	}
	diagnostic := descriptors[0].Diagnostics[0]
	if diagnostic.Code != "scenario_read_failed" || diagnostic.SourceFilename != "broken.yaml" {
		t.Fatalf("read-failed diagnostic = %+v, want scenario_read_failed for broken.yaml", diagnostic)
	}
	if !strings.Contains(diagnostic.Details, "permission denied") {
		t.Fatalf("read-failed details = %q, want underlying read error", diagnostic.Details)
	}
	if descriptors[1].ID != "valid.yaml" || descriptors[1].Status != StatusValid {
		t.Fatalf("valid descriptor = %+v, want valid valid.yaml descriptor", descriptors[1])
	}
}

func TestCatalogReportsUnknownFieldsAsStructuredDiagnostics(t *testing.T) {
	source := strings.Replace(validCatalogYAML("unknown"), "name: unknown\n", "name: unknown\nextra: true\n", 1)
	descriptors, err := NewCatalog(fstest.MapFS{"unknown.yaml": mapFile(source)}).List()
	if err != nil {
		t.Fatalf("List() failed: %v", err)
	}
	if len(descriptors) != 1 || len(descriptors[0].Diagnostics) != 1 {
		t.Fatalf("diagnostics = %+v, want one diagnostic", descriptors)
	}
	if descriptors[0].Diagnostics[0].Code != "unknown_yaml_field" {
		t.Fatalf("diagnostic code = %q, want unknown_yaml_field", descriptors[0].Diagnostics[0].Code)
	}
}

func TestCatalogKeepsValidScenarioWhenAnotherFileHasWarnings(t *testing.T) {
	catalog := NewCatalog(fstest.MapFS{
		"valid.yaml":   mapFile(validCatalogYAML("valid")),
		"warning.yaml": mapFile(strings.Replace(validCatalogYAML("warning"), "topology:\n", "topology:\n  - from: missing\n    to: valid\n", 1)),
	})

	descriptors, err := catalog.List()
	if err != nil {
		t.Fatalf("List() failed: %v", err)
	}
	if descriptors[0].Status != StatusValid || descriptors[1].Status != StatusValidWithWarnings {
		t.Fatalf("statuses = %q, %q, want valid and valid_with_warnings", descriptors[0].Status, descriptors[1].Status)
	}
}

func TestCatalogLoadValidInvalidUnknownAndUnsafeIDs(t *testing.T) {
	catalog := NewCatalog(fstest.MapFS{
		"valid.yaml":  mapFile(validCatalogYAML("valid")),
		"broken.yaml": mapFile("name: ["),
	})

	loaded, err := catalog.Load("valid.yaml")
	if err != nil {
		t.Fatalf("Load(valid.yaml) failed: %v", err)
	}
	if loaded.Name != "valid" {
		t.Fatalf("loaded name = %q, want valid", loaded.Name)
	}

	for _, id := range []string{"broken.yaml", "unknown.yaml", "../valid.yaml", "/valid.yaml", "valid/../valid.yaml"} {
		t.Run(id, func(t *testing.T) {
			if _, err := catalog.Load(id); err == nil {
				t.Fatalf("Load(%q) returned nil error", id)
			}
		})
	}
}

func TestCatalogReportsMissingFilesystemRoot(t *testing.T) {
	if _, err := NewCatalog(missingRootFS{}).List(); err == nil {
		t.Fatal("List() returned nil error for missing filesystem root")
	}
}

func TestCatalogSupportsAnEmptyFilesystem(t *testing.T) {
	descriptors, err := NewCatalog(fstest.MapFS{}).List()
	if err != nil {
		t.Fatalf("List() failed for an empty filesystem: %v", err)
	}
	if len(descriptors) != 0 {
		t.Fatalf("descriptor count = %d, want 0", len(descriptors))
	}
}

type missingRootFS struct{}

func (missingRootFS) Open(string) (fs.File, error) {
	return nil, fs.ErrNotExist
}

type readFailureFS struct {
	FS       fs.FS
	Failures map[string]error
}

func (f readFailureFS) Open(name string) (fs.File, error) {
	file, err := f.FS.Open(name)
	if err != nil {
		return nil, err
	}
	if readErr, shouldFail := f.Failures[name]; shouldFail {
		return &readFailureFile{File: file, Err: readErr}, nil
	}
	return file, nil
}

type readFailureFile struct {
	fs.File
	Err error
}

func (f *readFailureFile) Read([]byte) (int, error) {
	return 0, f.Err
}

func mapFile(source string) *fstest.MapFile {
	return &fstest.MapFile{Data: []byte(source)}
}

func validCatalogYAML(name string) string {
	return "name: " + name + `

publish:
  topic: valid
  payload:
    orderId: ord_1

watch:
  - watched

correlation:
  header: x-correlation-id

capture:
  timeout: 5s

topology:
  - from: valid
    to: watched
`
}
