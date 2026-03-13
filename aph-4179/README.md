# APH-4179

This folder holds the persistent working memory for Jira epic `APH-4179`.

Single source of truth: `state.yml`
- `state.yml`: epic scope, shared decisions, child ticket references, progress
- `aph-4356/`: child ticket folder for Cloud Logging vs GKE billing investigation

Rules
- Never store secrets or PII.
- Keep epic-level summaries here and detailed execution in child ticket folders.
- Update `progress.*` when epic scope, blockers, or child ticket status changes.
