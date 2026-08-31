package workspace

import (
	"sort"
	"strings"
)

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

// DeleteFolder removes a virtual folder tree and its local references without
// modifying the referenced files on disk.
func (s *Service) DeleteFolder(workspaceID, folderID string) (State, FolderDeletionReport, error) {
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
	return cloneState(s.state), report, nil
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
