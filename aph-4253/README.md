# APH-4253

This folder holds the persistent working memory for Jira ticket `APH-4253`.

Ralph (autonomous agent loop) runs each iteration with clean context. The single source of truth for memory is `aph-4253/state.yml`.

What lives here
- `aph-4253/state.yml`: requirements, decisions, API contracts, task list, and progress evidence
- `aph-4253/scripts/`: transient helper scripts/commands (no secrets)
- `aph-4253/notes/`: short notes and checklists (no secrets)

Rules
- Never store secrets (API tokens, service account keys, cert contents, Firebase tokens).
- Never store PII.
- After each iteration, update `progress.*` and any task statuses you touched.
- Keep `returnTo` allowlist and callback URL consistent with `decisions`.
