---
name: grepai-repo-discovery
description: Use when exploring this repository with natural-language code search, dependency tracing, or architecture discovery before opening files manually.
compatibility: opencode
---

# Grepai Repo Discovery

## What I do

- Use `grepai` first for repo discovery in this codebase.
- Turn broad user questions into semantic search or call-trace queries.
- Narrow findings to the most relevant files before opening source.
- Fall back to `rg` when the task needs exact string matching or regex precision.

## When to use me

- User asks where a feature, flow, handler, route, service, or model lives.
- User asks how a subsystem works end-to-end.
- User asks what calls a function, or what a symbol calls.
- You need fast architectural orientation before editing or reviewing code.

## Search policy

### Use `grepai` first for exploration

Start with `grepai` when the request is conceptual or structural:

- "Where is auth initialized?"
- "What code handles LYFIS scoring?"
- "How does pubsub processing work?"
- "What calls this service?"

Preferred commands:

```bash
grepai status --no-ui
grepai search "<natural language query>" --json --limit 5
grepai search "<natural language query>" --json --limit 5 --path src/common
grepai trace callers "<symbol>"
grepai trace callees "<symbol>"
grepai trace graph "<symbol>" --json
```

### Use `rg` directly for exact work

Do not force semantic search when the task is exact-match oriented:

- exact symbol lookup
- regex search
- refactors
- config key lookup
- finding literal env vars, route strings, error messages, or schema fields

Preferred fallback:

```bash
rg -n "<exact pattern>" .
rg --files | rg "<path hint>"
```

## Repo-specific guidance

Map the user’s question into likely areas before searching:

- `src/common` for shared services, auth, db, middleware, utilities
- `src/core` for core domain routes, handlers, models, services
- `src/anyo-lyfis` for LYFIS logic
- `src/anyo-rhythm` for rhythm-specific logic
- `src/anyo-circles` for circles features
- `src/anyo-mcp` for MCP-related routes
- `src/jobServer` for jobs, workers, pubsub, agenda
- `infra/` for Terraform, GCP, and deployment infrastructure
- `docs/` for design notes, ticket context, and operational guidance

Use `--path` whenever the likely domain is obvious. That keeps results tighter and reduces noisy candidates.

## Automatic consumption rules

When this skill applies, follow this workflow:

1. Check index health with `grepai status --no-ui` if search quality is uncertain.
2. Run one broad `grepai search` query in natural language.
3. If the user asks about impact or dependencies, run `grepai trace callers` or `grepai trace callees`.
4. Open only the top candidate files needed to verify behavior.
5. Summarize verified findings, not raw semantic guesses.
6. Switch to `rg` if you need exact matches or if `grepai` results are weak.

## Verification rules

- Treat `grepai` output as leads, not ground truth.
- Verify any behavioral claim by opening the referenced source files.
- Prefer reading the smallest number of files needed to confirm the answer.
- If `grepai` appears stale, missing, or low quality, say that briefly and fall back to `rg`.

## Good query patterns

Good semantic queries:

- `grepai search "request authentication middleware initialization" --json --limit 5`
- `grepai search "LYFIS score calculation and persistence" --json --limit 5 --path src/anyo-lyfis`
- `grepai search "Google chat notification sending service" --json --limit 5 --path src/common`

Good trace queries:

- `grepai trace callers "sendPushNotification"`
- `grepai trace callees "handleWebhook"`

## Common mistakes

- Using `grepai` for exact refactor work that should be done with `rg`.
- Reporting `grepai` hits without opening the files.
- Searching the whole repo when the domain is obvious and should be narrowed with `--path`.
- Opening too many files before checking whether `grepai` already narrowed the search well.
