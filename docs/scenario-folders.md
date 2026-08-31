# Scenario folders

Scenario folders are virtual folders for organizing imported and newly saved
scenario files in Orson. They organize the scenario list without changing the
files or directories on disk.

Folders belong to the active workspace. A folder, its nesting, and its scenario
ordering are not shared with other workspaces, even when two workspaces refer
to the same scenario file. Folder changes are saved with workspace state and
restored when Orson is reopened.

Use the folder and scenario actions in the **My scenarios** section to create
items. Drag scenarios onto a folder to move them into it, onto the empty space
in the scenario list to move them back to the workspace root, or between
sibling items to reorder them. Folders can be nested by dropping one folder
onto another folder.

Deleting a folder deletes the folder and its nested folders from the workspace,
removes their scenario associations, and attempts to delete the associated
local files. A file referenced by another workspace is kept on disk and only
removed from the current workspace. If a file cannot be deleted, its scenario
association remains so the failure can be retried. Use **Remove from workspace**
when you want to forget a scenario association without deleting the file.
