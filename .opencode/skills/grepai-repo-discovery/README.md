# Grepai Repo Discovery Skill

This skill makes OpenCode use local `grepai` indexing as the first step for repo discovery in `anyobackendapi`.

## Purpose

- Improve repo exploration for broad questions.
- Keep semantic search separate from exact-match search.
- Reduce file sprawl by opening only the most relevant candidates after `grepai` results.

## Expected local setup

The repo owner should already have initialized `grepai` in this repository.

Useful commands:

```bash
grepai status --no-ui
grepai watch
grepai search "auth initialization" --json --limit 5
grepai trace callers "SomeSymbol"
grepai trace callees "SomeSymbol"
```

## Operating model

- `grepai` first for discovery, architecture, and dependency questions
- `rg` first for exact strings, regexes, and bulk edits
- always verify semantic hits by opening source files before making claims

## Why this is repo-specific

This backend is large and split across multiple domains under `src/common`, `src/core`, `src/anyo-*`, `src/jobServer`, and `infra/`. The skill guides OpenCode to narrow semantic searches into the right area instead of searching blindly across the entire repo.
