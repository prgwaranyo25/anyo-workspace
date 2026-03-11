---
name: session-start
description: Orient at the start of a session when the workspace may contain standalone tickets, epic folders, and nested child tickets with separate state.yml files
---

1. Scan the workspace root for folders matching `aph-*/` and skip `_template/` and `_epic_template/`.
2. For each root `aph-*` folder:
   - If it has a root `state.yml` and no child `aph-*` folders, treat it as a standalone ticket.
   - If it has a root `state.yml` and child `aph-*` folders with their own `state.yml`, treat it as an epic folder.
3. Read each discovered `state.yml` and extract `meta.jira`, `meta.title`, and `meta.status`.
4. Present the workspace in a hierarchical view:
   - Standalone tickets grouped by status.
   - Epic folders grouped by status, with child tickets listed underneath.
5. Ask the user which work item to load.
6. If the chosen work item is a standalone ticket, read its full `state.yml` and summarize:
   - Title and repos in scope (`meta.repos_and_paths`)
   - Pending and in-progress tasks
   - Any blocking questions (`progress.blocking_questions`)
7. If the chosen work item is a child ticket under an epic:
   - Read the child ticket `state.yml` and summarize the same ticket-specific details.
   - Also read the parent epic `state.yml` and provide a brief epic summary: epic title, shared repos in scope, and active blockers.
8. If the chosen work item is an epic, read the epic `state.yml` and summarize:
   - Epic title and shared repos in scope
   - Child ticket list with high-level status
   - Any epic-level blocking questions (`progress.blocking_questions`)
9. Confirm ready: `Loaded APH-XXXX — <title>. What do you need?`
