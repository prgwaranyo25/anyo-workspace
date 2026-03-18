# APH-4418

This folder holds the persistent working memory for Jira epic `APH-4418`.

Single source of truth: `state.yml`
- `state.yml`: epic scope, shared decisions, child ticket references, progress
- `AGENTS.md`: route-investigation workflow and session rules for this epic
- `aph-XXXX/`: child ticket folders, each with its own `state.yml`

Rules
- Never store secrets or PII.
- Keep epic-level summaries here and detailed execution in child ticket folders.
- Update `progress.*` when epic scope, blockers, or child ticket status changes.
- Follow `AGENTS.md` for deep route analysis before proposing any route fix.
