---
name: session-start
description: Orient at the start of a session — scan ticket folders, read state.yml files, summarise active tickets, ask which to load
---

1. Scan the workspace root for folders matching `aph-*/` (skip `_template/`).
2. For each folder read `state.yml` → extract `meta.jira`, `meta.title`, `meta.status`.
3. List tickets grouped by status (active / completed / blocked).
4. Ask the user which ticket to work on.
5. Read the full `state.yml` of the chosen ticket and summarise:
   - Title and repos in scope (`meta.repos_and_paths`)
   - Pending and in-progress tasks
   - Any blocking questions (`progress.blocking_questions`)
6. Confirm ready: "Loaded APH-XXXX — <title>. What do you need?"
