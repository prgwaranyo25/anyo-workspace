---
name: new-ticket
description: Use when a new Jira work item must be created and scaffolded as either a standalone ticket or a child ticket inside an optional epic folder
---

1. Ask the user to describe the feature or problem to solve.
2. Clarify: which repos are in scope? Any known constraints or decisions already made?
3. Clarify whether this should be a standalone ticket or part of an epic:
   - If the user names an epic key, use it.
   - If the user says the work belongs to an epic but does not provide the key, ask which epic folder to use or whether a new epic must be created.
4. Summarise the requirement back and get confirmation before creating anything.
5. Use the `jira-confluence-rest` skill to create a Jira issue in project APH:
   - Issue type: Story (or Task if small/chore)
   - Summary: concise one-line title
   - Description: requirement summary from the brainstorm
6. Capture the returned ticket key (e.g. APH-4300).
7. Scaffold the folder based on ticket type:
   - Standalone ticket:
     ```bash
     cp -r _template/ aph-<number>/
     ```
   - Child ticket under an existing epic folder:
     ```bash
     cp -r _template/ aph-<epic-number>/aph-<number>/
     ```
   - Child ticket under a new epic folder:
     ```bash
     cp -r _epic_template/ aph-<epic-number>/
     cp -r _template/ aph-<epic-number>/aph-<number>/
     ```
8. Edit the ticket `state.yml` (`aph-<number>/state.yml` for standalone, or `aph-<epic-number>/aph-<number>/state.yml` for a child ticket):
   - `meta.jira`: APH-<number>
   - `meta.title`: ticket summary
   - `meta.created`: today's date (YYYY-MM-DD)
   - `meta.repos_and_paths`: from the scope agreed in step 2
9. If the ticket belongs to an epic, also update the epic `state.yml` with:
   - epic key and title
   - child ticket reference and status
   - any shared repo scope or cross-ticket constraints already known
10. Report back: Jira URL + created folder path. Ready to implement.
