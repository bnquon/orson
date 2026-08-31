package workspace

import (
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const sessionWarning = "Session only—workspace changes will be lost when Orson closes."

var (
	ErrWorkspaceNotFound            = errors.New("workspace not found")
	ErrWorkspaceNameRequired        = errors.New("workspace name is required")
	ErrWorkspaceNameDuplicate       = errors.New("workspace name already exists")
	ErrFolderNotFound               = errors.New("folder not found")
	ErrFolderNameRequired           = errors.New("folder name is required")
	ErrFolderNameDuplicate          = errors.New("folder name already exists")
	ErrFolderNameInvalid            = errors.New("folder name is invalid")
	ErrFolderParentNotFound         = errors.New("folder parent not found")
	ErrFolderMoveCycle              = errors.New("folder cannot be moved into itself or a descendant")
	ErrScenarioNotFound             = errors.New("scenario not found")
	ErrInvalidSiblingOrder          = errors.New("invalid sibling order")
	ErrFolderDeletionPartial        = errors.New("folder deletion partially failed")
	ErrRecoveryConfirmationRequired = errors.New("persistence recovery confirmation is required")
)

type OpenDatabase func(string) (*sql.DB, error)

type Options struct {
	DatabasePath string
	OpenDatabase OpenDatabase
	Now          func() time.Time
	NewID        func() string
}

type Service struct {
	mu         sync.Mutex
	path       string
	open       OpenDatabase
	now        func() time.Time
	newID      func() string
	db         *sql.DB
	state      State
	deletedIDs map[string]struct{}
}

func DefaultDatabasePath() (string, error) {
	root, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, "Orson", "orson.db"), nil
}

func NewService(options Options) *Service {
	if options.Now == nil {
		options.Now = func() time.Time { return time.Now().UTC() }
	}
	if options.NewID == nil {
		options.NewID = func() string { return uuid.NewString() }
	}
	if options.OpenDatabase == nil {
		options.OpenDatabase = openSQLite
	}
	service := &Service{
		path:       options.DatabasePath,
		open:       options.OpenDatabase,
		now:        options.Now,
		newID:      options.NewID,
		deletedIDs: make(map[string]struct{}),
	}
	service.initialize()
	return service
}

func (s *Service) emptyState() State {
	return State{
		Scenarios:   make(map[string][]ScenarioReference),
		Folders:     make(map[string][]Folder),
		Connections: make(map[string]*ConnectionConfig),
		Selections:  make(map[string]*Selection),
	}
}

func (s *Service) Snapshot() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneState(s.state)
}

func (s *Service) Create(name string) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	name, err := validateName(s.state, "", name)
	if err != nil {
		return State{}, err
	}
	next := cloneState(s.state)
	now := s.now()
	id := s.newID()
	next.Workspaces = append(next.Workspaces, Workspace{ID: id, Name: name, CreatedAt: now, UpdatedAt: now, LastOpenedAt: now})
	next.ActiveWorkspaceID = id
	sortWorkspaces(next.Workspaces)
	s.commit(next, "create workspace")
	return cloneState(s.state), nil
}

func (s *Service) Rename(id, name string) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	name, err := validateName(s.state, id, name)
	if err != nil {
		return State{}, err
	}
	next := cloneState(s.state)
	index := workspaceIndex(next, id)
	if index < 0 {
		return State{}, ErrWorkspaceNotFound
	}
	next.Workspaces[index].Name = name
	next.Workspaces[index].UpdatedAt = s.now()
	s.commit(next, "rename workspace")
	return cloneState(s.state), nil
}

func (s *Service) SetActive(id string) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := cloneState(s.state)
	index := workspaceIndex(next, id)
	if index < 0 {
		return State{}, ErrWorkspaceNotFound
	}
	now := s.now()
	next.ActiveWorkspaceID = id
	next.Workspaces[index].LastOpenedAt = now
	next.Workspaces[index].UpdatedAt = now
	sortWorkspaces(next.Workspaces)
	s.commit(next, "switch workspace")
	return cloneState(s.state), nil
}

func (s *Service) Delete(id string) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := cloneState(s.state)
	index := workspaceIndex(next, id)
	if index < 0 {
		return State{}, ErrWorkspaceNotFound
	}
	next.Workspaces = append(next.Workspaces[:index], next.Workspaces[index+1:]...)
	delete(next.Scenarios, id)
	delete(next.Folders, id)
	delete(next.Connections, id)
	delete(next.Selections, id)
	if next.ActiveWorkspaceID == id && len(next.Workspaces) > 0 {
		sortWorkspaces(next.Workspaces)
		next.ActiveWorkspaceID = next.Workspaces[0].ID
	} else if len(next.Workspaces) == 0 {
		next.ActiveWorkspaceID = ""
	}
	wasFallback := s.db == nil
	s.commit(next, "delete workspace")
	if wasFallback || s.db == nil {
		s.deletedIDs[id] = struct{}{}
	}
	return cloneState(s.state), nil
}

func (s *Service) UpsertScenario(reference ScenarioReference) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if workspaceIndex(s.state, reference.WorkspaceID) < 0 {
		return ErrWorkspaceNotFound
	}
	next := cloneState(s.state)
	reference.FolderID = strings.TrimSpace(reference.FolderID)
	if reference.FolderID != "" && folderIndex(next.Folders[reference.WorkspaceID], reference.FolderID) < 0 {
		return ErrFolderNotFound
	}
	items := next.Scenarios[reference.WorkspaceID]
	updated := false
	for index := range items {
		if items[index].CanonicalPath == reference.CanonicalPath {
			reference.ImportedAt = items[index].ImportedAt
			reference.FolderID = items[index].FolderID
			reference.SiblingOrder = items[index].SiblingOrder
			items[index] = reference
			updated = true
			break
		}
	}
	if !updated {
		reference.SiblingOrder = nextScenarioOrder(next.Scenarios[reference.WorkspaceID], reference.FolderID)
		items = append(items, reference)
	}
	next.Scenarios[reference.WorkspaceID] = items
	s.commit(next, "save scenario association")
	return nil
}

// RemoveScenario removes one local-file association from a workspace. The
// canonical file itself is intentionally never touched.
func (s *Service) RemoveScenario(workspaceID, canonicalPath string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if workspaceIndex(s.state, workspaceID) < 0 {
		return ErrWorkspaceNotFound
	}

	next := cloneState(s.state)
	items := next.Scenarios[workspaceID]
	filtered := items[:0]
	removed := false
	for _, item := range items {
		if item.CanonicalPath == canonicalPath {
			removed = true
			continue
		}
		filtered = append(filtered, item)
	}
	if removed {
		if len(filtered) == 0 {
			delete(next.Scenarios, workspaceID)
		} else {
			next.Scenarios[workspaceID] = filtered
		}
	}
	selection := next.Selections[workspaceID]
	selectionRemoved := false
	if selection != nil && selection.Source == "local" && selection.Reference == canonicalPath {
		delete(next.Selections, workspaceID)
		selectionRemoved = true
	}
	if !removed && !selectionRemoved {
		return nil
	}
	s.commit(next, "remove scenario association")
	return nil
}

func (s *Service) CreateFolder(workspaceID, parentID, name string) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := cloneState(s.state)
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceIndex(next, workspaceID) < 0 {
		return State{}, ErrWorkspaceNotFound
	}
	parentID = strings.TrimSpace(parentID)
	if parentID != "" && folderIndex(next.Folders[workspaceID], parentID) < 0 {
		return State{}, ErrFolderParentNotFound
	}
	name, err := validateFolderName(next.Folders[workspaceID], parentID, "", name)
	if err != nil {
		return State{}, err
	}
	now := s.now()
	folder := Folder{ID: s.newID(), WorkspaceID: workspaceID, Name: name, ParentID: parentID, SiblingOrder: nextFolderOrder(next.Folders[workspaceID], parentID), CreatedAt: now, UpdatedAt: now}
	next.Folders[workspaceID] = append(next.Folders[workspaceID], folder)
	s.commit(next, "create scenario folder")
	return cloneState(s.state), nil
}

func (s *Service) RenameFolder(workspaceID, folderID, name string) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := cloneState(s.state)
	workspaceID = strings.TrimSpace(workspaceID)
	folderID = strings.TrimSpace(folderID)
	index := folderIndex(next.Folders[workspaceID], folderID)
	if workspaceIndex(next, workspaceID) < 0 {
		return State{}, ErrWorkspaceNotFound
	}
	if index < 0 {
		return State{}, ErrFolderNotFound
	}
	name, err := validateFolderName(next.Folders[workspaceID], next.Folders[workspaceID][index].ParentID, folderID, name)
	if err != nil {
		return State{}, err
	}
	next.Folders[workspaceID][index].Name = name
	next.Folders[workspaceID][index].UpdatedAt = s.now()
	s.commit(next, "rename scenario folder")
	return cloneState(s.state), nil
}

func (s *Service) MoveFolder(workspaceID, folderID, parentID string) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := cloneState(s.state)
	workspaceID = strings.TrimSpace(workspaceID)
	folderID = strings.TrimSpace(folderID)
	parentID = strings.TrimSpace(parentID)
	if workspaceIndex(next, workspaceID) < 0 {
		return State{}, ErrWorkspaceNotFound
	}
	folders := next.Folders[workspaceID]
	index := folderIndex(folders, folderID)
	if index < 0 {
		return State{}, ErrFolderNotFound
	}
	if parentID != "" && folderIndex(folders, parentID) < 0 {
		return State{}, ErrFolderParentNotFound
	}
	if parentID == folderID || isFolderDescendant(folders, folderID, parentID) {
		return State{}, ErrFolderMoveCycle
	}
	if folders[index].ParentID == parentID {
		return cloneState(s.state), nil
	}
	folders[index].ParentID = parentID
	folders[index].SiblingOrder = nextFolderOrder(folders, parentID)
	folders[index].UpdatedAt = s.now()
	normalizeFolderOrders(folders)
	next.Folders[workspaceID] = folders
	s.commit(next, "move scenario folder")
	return cloneState(s.state), nil
}

func (s *Service) ReorderFolder(workspaceID, folderID string, siblingIndex int) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := cloneState(s.state)
	workspaceID = strings.TrimSpace(workspaceID)
	folderID = strings.TrimSpace(folderID)
	if workspaceIndex(next, workspaceID) < 0 {
		return State{}, ErrWorkspaceNotFound
	}
	folders := next.Folders[workspaceID]
	index := folderIndex(folders, folderID)
	if index < 0 {
		return State{}, ErrFolderNotFound
	}
	if siblingIndex < 0 {
		return State{}, ErrInvalidSiblingOrder
	}
	parentID := folders[index].ParentID
	ordered := orderedFolders(folders, parentID)
	if siblingIndex >= len(ordered) {
		siblingIndex = len(ordered) - 1
	}
	if len(ordered) == 0 {
		return State{}, ErrFolderNotFound
	}
	var moving Folder
	remaining := make([]Folder, 0, len(ordered)-1)
	for _, item := range ordered {
		if item.ID == folderID {
			moving = item
			continue
		}
		remaining = append(remaining, item)
	}
	if siblingIndex > len(remaining) {
		siblingIndex = len(remaining)
	}
	remaining = append(remaining, Folder{})
	copy(remaining[siblingIndex+1:], remaining[siblingIndex:])
	remaining[siblingIndex] = moving
	for order, item := range remaining {
		for index := range folders {
			if folders[index].ID == item.ID {
				folders[index].SiblingOrder = order
				break
			}
		}
	}
	next.Folders[workspaceID] = folders
	s.commit(next, "reorder scenario folder")
	return cloneState(s.state), nil
}

func (s *Service) MoveScenario(workspaceID, canonicalPath, folderID string) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := cloneState(s.state)
	workspaceID = strings.TrimSpace(workspaceID)
	canonicalPath = strings.TrimSpace(canonicalPath)
	folderID = strings.TrimSpace(folderID)
	if workspaceIndex(next, workspaceID) < 0 {
		return State{}, ErrWorkspaceNotFound
	}
	if folderID != "" && folderIndex(next.Folders[workspaceID], folderID) < 0 {
		return State{}, ErrFolderNotFound
	}
	items := next.Scenarios[workspaceID]
	index := scenarioIndex(items, canonicalPath)
	if index < 0 {
		return State{}, ErrScenarioNotFound
	}
	if items[index].FolderID == folderID {
		return cloneState(s.state), nil
	}
	items[index].FolderID = folderID
	items[index].SiblingOrder = nextScenarioOrder(items, folderID)
	normalizeScenarioOrders(items)
	next.Scenarios[workspaceID] = items
	s.commit(next, "move local scenario")
	return cloneState(s.state), nil
}

func (s *Service) ReorderScenario(workspaceID, canonicalPath string, siblingIndex int) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := cloneState(s.state)
	workspaceID = strings.TrimSpace(workspaceID)
	canonicalPath = strings.TrimSpace(canonicalPath)
	if workspaceIndex(next, workspaceID) < 0 {
		return State{}, ErrWorkspaceNotFound
	}
	items := next.Scenarios[workspaceID]
	index := scenarioIndex(items, canonicalPath)
	if index < 0 {
		return State{}, ErrScenarioNotFound
	}
	if siblingIndex < 0 {
		return State{}, ErrInvalidSiblingOrder
	}
	folderID := items[index].FolderID
	ordered := orderedScenarios(items, folderID)
	if siblingIndex >= len(ordered) {
		siblingIndex = len(ordered) - 1
	}
	var moving ScenarioReference
	remaining := make([]ScenarioReference, 0, len(ordered)-1)
	for _, item := range ordered {
		if item.CanonicalPath == canonicalPath {
			moving = item
			continue
		}
		remaining = append(remaining, item)
	}
	if siblingIndex > len(remaining) {
		siblingIndex = len(remaining)
	}
	remaining = append(remaining, ScenarioReference{})
	copy(remaining[siblingIndex+1:], remaining[siblingIndex:])
	remaining[siblingIndex] = moving
	for order, item := range remaining {
		for index := range items {
			if items[index].CanonicalPath == item.CanonicalPath {
				items[index].SiblingOrder = order
				break
			}
		}
	}
	next.Scenarios[workspaceID] = items
	s.commit(next, "reorder local scenario")
	return cloneState(s.state), nil
}

// DeleteFolder removes a virtual folder tree and its local references. The
// removeFile callback is deliberately supplied by the local-file adapter.
func (s *Service) DeleteFolder(workspaceID, folderID string, removeFile func(string) error) (State, FolderDeletionReport, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := cloneState(s.state)
	workspaceID = strings.TrimSpace(workspaceID)
	folderID = strings.TrimSpace(folderID)
	var report FolderDeletionReport
	if workspaceIndex(next, workspaceID) < 0 {
		return State{}, report, ErrWorkspaceNotFound
	}
	folders := next.Folders[workspaceID]
	if folderIndex(folders, folderID) < 0 {
		return State{}, report, ErrFolderNotFound
	}
	tree := folderTreeIDs(folders, folderID)
	items := next.Scenarios[workspaceID]
	remaining := make([]ScenarioReference, 0, len(items))
	for _, reference := range items {
		if _, inTree := tree[reference.FolderID]; !inTree {
			remaining = append(remaining, reference)
			continue
		}
		shared := scenarioReferencedElsewhere(next, workspaceID, reference.CanonicalPath)
		if shared {
			report.SharedPaths = append(report.SharedPaths, reference.CanonicalPath)
			report.RemovedPaths = append(report.RemovedPaths, reference.CanonicalPath)
			continue
		}
		if removeFile == nil {
			report.FailedPaths = append(report.FailedPaths, reference.CanonicalPath)
			remaining = append(remaining, reference)
			continue
		}
		if err := removeFile(reference.CanonicalPath); err != nil && !errors.Is(err, fs.ErrNotExist) {
			report.FailedPaths = append(report.FailedPaths, reference.CanonicalPath)
			remaining = append(remaining, reference)
			continue
		}
		report.RemovedPaths = append(report.RemovedPaths, reference.CanonicalPath)
	}
	if len(remaining) == 0 {
		delete(next.Scenarios, workspaceID)
	} else {
		normalizeScenarioOrders(remaining)
		next.Scenarios[workspaceID] = remaining
	}
	if selection := next.Selections[workspaceID]; selection != nil && selection.Source == "local" && containsString(report.RemovedPaths, selection.Reference) {
		delete(next.Selections, workspaceID)
	}
	remainingFolders := pruneDeletedFolders(folders, tree, remaining)
	if len(remainingFolders) == 0 {
		delete(next.Folders, workspaceID)
	} else {
		normalizeFolderOrders(remainingFolders)
		next.Folders[workspaceID] = remainingFolders
	}
	s.commit(next, "delete scenario folder")
	if len(report.FailedPaths) > 0 {
		return cloneState(s.state), report, fmt.Errorf("%w: %s", ErrFolderDeletionPartial, strings.Join(report.FailedPaths, ", "))
	}
	return cloneState(s.state), report, nil
}

func (s *Service) SaveConnection(config ConnectionConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if workspaceIndex(s.state, config.WorkspaceID) < 0 {
		return ErrWorkspaceNotFound
	}
	next := cloneState(s.state)
	copyConfig := config
	copyConfig.Brokers = append([]string(nil), config.Brokers...)
	next.Connections[config.WorkspaceID] = &copyConfig
	s.commit(next, "save connection settings")
	return nil
}

func (s *Service) SetSelection(selection Selection) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if workspaceIndex(s.state, selection.WorkspaceID) < 0 {
		return ErrWorkspaceNotFound
	}
	next := cloneState(s.state)
	copySelection := selection
	next.Selections[selection.WorkspaceID] = &copySelection
	s.commit(next, "save selected scenario")
	return nil
}

func validateName(state State, currentID, raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", ErrWorkspaceNameRequired
	}
	key := strings.ToLower(name)
	for _, item := range state.Workspaces {
		if item.ID != currentID && strings.ToLower(strings.TrimSpace(item.Name)) == key {
			return "", ErrWorkspaceNameDuplicate
		}
	}
	return name, nil
}

func validateFolderName(folders []Folder, parentID, currentID, raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", ErrFolderNameRequired
	}
	if strings.ContainsAny(name, `/\\`) {
		return "", ErrFolderNameInvalid
	}
	key := strings.ToLower(name)
	for _, folder := range folders {
		if folder.ID != currentID && folder.ParentID == parentID && strings.ToLower(strings.TrimSpace(folder.Name)) == key {
			return "", ErrFolderNameDuplicate
		}
	}
	return name, nil
}

func folderIndex(folders []Folder, id string) int {
	for index := range folders {
		if folders[index].ID == strings.TrimSpace(id) {
			return index
		}
	}
	return -1
}

func scenarioIndex(items []ScenarioReference, canonicalPath string) int {
	for index := range items {
		if items[index].CanonicalPath == canonicalPath {
			return index
		}
	}
	return -1
}

func nextFolderOrder(folders []Folder, parentID string) int {
	max := -1
	for _, folder := range folders {
		if folder.ParentID == parentID && folder.SiblingOrder > max {
			max = folder.SiblingOrder
		}
	}
	return max + 1
}

func nextScenarioOrder(items []ScenarioReference, folderID string) int {
	max := -1
	for _, item := range items {
		if item.FolderID == folderID && item.SiblingOrder > max {
			max = item.SiblingOrder
		}
	}
	return max + 1
}

func orderedFolders(folders []Folder, parentID string) []Folder {
	result := make([]Folder, 0)
	for _, folder := range folders {
		if folder.ParentID == parentID {
			result = append(result, folder)
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].SiblingOrder != result[j].SiblingOrder {
			return result[i].SiblingOrder < result[j].SiblingOrder
		}
		return result[i].ID < result[j].ID
	})
	return result
}

func orderedScenarios(items []ScenarioReference, folderID string) []ScenarioReference {
	result := make([]ScenarioReference, 0)
	for _, item := range items {
		if item.FolderID == folderID {
			result = append(result, item)
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].SiblingOrder != result[j].SiblingOrder {
			return result[i].SiblingOrder < result[j].SiblingOrder
		}
		return result[i].CanonicalPath < result[j].CanonicalPath
	})
	return result
}

func normalizeFolderOrders(folders []Folder) {
	parents := make(map[string]struct{})
	for _, folder := range folders {
		parents[folder.ParentID] = struct{}{}
	}
	for parentID := range parents {
		for order, item := range orderedFolders(folders, parentID) {
			for index := range folders {
				if folders[index].ID == item.ID {
					folders[index].SiblingOrder = order
					break
				}
			}
		}
	}
}

func normalizeScenarioOrders(items []ScenarioReference) {
	folders := make(map[string]struct{})
	for _, item := range items {
		folders[item.FolderID] = struct{}{}
	}
	for folderID := range folders {
		for order, item := range orderedScenarios(items, folderID) {
			for index := range items {
				if items[index].CanonicalPath == item.CanonicalPath {
					items[index].SiblingOrder = order
					break
				}
			}
		}
	}
}

func isFolderDescendant(folders []Folder, ancestorID, candidateID string) bool {
	for current := candidateID; current != ""; {
		index := folderIndex(folders, current)
		if index < 0 {
			return false
		}
		current = folders[index].ParentID
		if current == ancestorID {
			return true
		}
	}
	return false
}

func folderTreeIDs(folders []Folder, rootID string) map[string]struct{} {
	tree := map[string]struct{}{rootID: {}}
	changed := true
	for changed {
		changed = false
		for _, folder := range folders {
			if _, included := tree[folder.ParentID]; included {
				if _, exists := tree[folder.ID]; !exists {
					tree[folder.ID] = struct{}{}
					changed = true
				}
			}
		}
	}
	return tree
}

func scenarioReferencedElsewhere(state State, workspaceID, canonicalPath string) bool {
	for otherWorkspaceID, items := range state.Scenarios {
		if otherWorkspaceID == workspaceID {
			continue
		}
		for _, item := range items {
			if item.CanonicalPath == canonicalPath {
				return true
			}
		}
	}
	return false
}

func pruneDeletedFolders(folders []Folder, tree map[string]struct{}, remaining []ScenarioReference) []Folder {
	kept := append([]Folder(nil), folders...)
	for {
		removed := false
		for index := len(kept) - 1; index >= 0; index-- {
			folder := kept[index]
			if _, inTree := tree[folder.ID]; !inTree {
				continue
			}
			hasScenario := false
			for _, item := range remaining {
				if item.FolderID == folder.ID {
					hasScenario = true
					break
				}
			}
			hasChild := false
			for _, child := range kept {
				if child.ParentID == folder.ID {
					hasChild = true
					break
				}
			}
			if !hasScenario && !hasChild {
				kept = append(kept[:index], kept[index+1:]...)
				removed = true
			}
		}
		if !removed {
			break
		}
	}
	return kept
}

func containsString(items []string, wanted string) bool {
	for _, item := range items {
		if item == wanted {
			return true
		}
	}
	return false
}

func workspaceIndex(state State, id string) int {
	for index := range state.Workspaces {
		if state.Workspaces[index].ID == strings.TrimSpace(id) {
			return index
		}
	}
	return -1
}

func sortWorkspaces(items []Workspace) {
	sort.SliceStable(items, func(i, j int) bool {
		if !items[i].LastOpenedAt.Equal(items[j].LastOpenedAt) {
			return items[i].LastOpenedAt.After(items[j].LastOpenedAt)
		}
		if !items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].CreatedAt.Before(items[j].CreatedAt)
		}
		return items[i].ID < items[j].ID
	})
}

func cloneState(source State) State {
	clone := source
	clone.Workspaces = append([]Workspace(nil), source.Workspaces...)
	clone.Scenarios = make(map[string][]ScenarioReference, len(source.Scenarios))
	for id, items := range source.Scenarios {
		clone.Scenarios[id] = append([]ScenarioReference(nil), items...)
	}
	clone.Folders = make(map[string][]Folder, len(source.Folders))
	for id, items := range source.Folders {
		clone.Folders[id] = append([]Folder(nil), items...)
	}
	clone.Connections = make(map[string]*ConnectionConfig, len(source.Connections))
	for id, config := range source.Connections {
		if config != nil {
			copyConfig := *config
			copyConfig.Brokers = append([]string(nil), config.Brokers...)
			clone.Connections[id] = &copyConfig
		}
	}
	clone.Selections = make(map[string]*Selection, len(source.Selections))
	for id, selection := range source.Selections {
		if selection != nil {
			copySelection := *selection
			clone.Selections[id] = &copySelection
		}
	}
	return clone
}

func mergeRecovered(durable, session State, deleted map[string]struct{}, now time.Time) State {
	merged := cloneState(durable)
	usedNames := make(map[string]struct{}, len(merged.Workspaces))
	for _, item := range merged.Workspaces {
		if _, wasDeleted := deleted[item.ID]; wasDeleted {
			continue
		}
		usedNames[strings.ToLower(strings.TrimSpace(item.Name))] = struct{}{}
	}
	for _, item := range session.Workspaces {
		if _, wasDeleted := deleted[item.ID]; wasDeleted {
			continue
		}
		index := workspaceIndex(merged, item.ID)
		if index >= 0 {
			delete(usedNames, strings.ToLower(strings.TrimSpace(merged.Workspaces[index].Name)))
			item.Name = availableRecoveredName(item.Name, usedNames)
			merged.Workspaces[index] = item
			usedNames[strings.ToLower(strings.TrimSpace(item.Name))] = struct{}{}
		} else {
			item.Name = availableRecoveredName(item.Name, usedNames)
			item.UpdatedAt = now
			merged.Workspaces = append(merged.Workspaces, item)
			usedNames[strings.ToLower(item.Name)] = struct{}{}
		}
		merged.Scenarios[item.ID] = append([]ScenarioReference(nil), session.Scenarios[item.ID]...)
		merged.Folders[item.ID] = append([]Folder(nil), session.Folders[item.ID]...)
		if connection := session.Connections[item.ID]; connection != nil {
			copyConfig := *connection
			copyConfig.Brokers = append([]string(nil), connection.Brokers...)
			merged.Connections[item.ID] = &copyConfig
		} else {
			delete(merged.Connections, item.ID)
		}
		if selection := session.Selections[item.ID]; selection != nil {
			copySelection := *selection
			merged.Selections[item.ID] = &copySelection
		} else {
			delete(merged.Selections, item.ID)
		}
	}
	for id := range deleted {
		index := workspaceIndex(merged, id)
		if index >= 0 {
			merged.Workspaces = append(merged.Workspaces[:index], merged.Workspaces[index+1:]...)
			delete(merged.Scenarios, id)
			delete(merged.Folders, id)
			delete(merged.Connections, id)
			delete(merged.Selections, id)
		}
	}
	merged.ActiveWorkspaceID = session.ActiveWorkspaceID
	sortWorkspaces(merged.Workspaces)
	if workspaceIndex(merged, merged.ActiveWorkspaceID) < 0 && len(merged.Workspaces) > 0 {
		merged.ActiveWorkspaceID = merged.Workspaces[0].ID
	}
	return merged
}

func availableRecoveredName(base string, used map[string]struct{}) string {
	if _, exists := used[strings.ToLower(base)]; !exists {
		return base
	}
	candidate := base + " (recovered)"
	for suffix := 2; ; suffix++ {
		if _, exists := used[strings.ToLower(candidate)]; !exists {
			return candidate
		}
		candidate = fmt.Sprintf("%s (recovered %d)", base, suffix)
	}
}
