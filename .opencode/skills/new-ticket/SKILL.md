---
name: new-ticket
description: Brainstorm requirements with the user, create a Jira ticket using the jira-confluence-rest skill, then scaffold the ticket folder from _template/
---

1. Ask the user to describe the feature or problem to solve.
2. Clarify: which repos are in scope? Any known constraints or decisions already made?
3. Summarise the requirement back and get confirmation before creating anything.
4. Use the `jira-confluence-rest` skill to create a Jira issue in project APH:
   - Issue type: Story (or Task if small/chore)
   - Summary: concise one-line title
   - Description: requirement summary from the brainstorm
5. Capture the returned ticket key (e.g. APH-4300).
6. Scaffold the folder:
   ```bash
   cp -r _template/ aph-<number>/
   ```
7. Edit `aph-<number>/state.yml`:
   - `meta.jira`: APH-<number>
   - `meta.title`: ticket summary
   - `meta.created`: today's date (YYYY-MM-DD)
   - `meta.repos_and_paths`: from the scope agreed in step 2
8. Report back: Jira URL + folder path. Ready to implement.
