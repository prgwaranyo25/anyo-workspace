# APH-EPIC

This folder holds the persistent working memory for Jira epic `APH-EPIC`.

Single source of truth: `state.yml`
- `state.yml`: epic scope, shared decisions, child ticket references, progress
- `aph-XXXX/`: child ticket folders, each with its own `state.yml`

Rules
- Never store secrets or PII.
- Keep epic-level summaries here and detailed execution in child ticket folders.
- Update `progress.*` when epic scope, blockers, or child ticket status changes.
