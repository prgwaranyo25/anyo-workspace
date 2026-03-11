# anyo-workspace

## Project

Anyo is a platform connecting customers with domain experts. The product spans a customer-facing PWA/mobile app, an expert portal, an admin portal, a partner portal, a backend API, and supporting services (auth, CMS, Cloudflare edge). All code lives in separate git repos under `/home/pragadeesh/Documents/anyo/`. This workspace folder is the single place to open in Claude Code or VSCode when working across standalone tickets and epic-based ticket groups.

---

## Repos

| Repo | Path | Stack | Purpose |
|------|------|-------|---------|
| anyobackendapi | `../anyobackendapi` | TypeScript · Express · pnpm | Main backend API |
| anyocustomerapp | `../anyocustomerapp` | TypeScript · React Native + Expo · yarn | Customer-facing mobile app |
| anyoexpertportal | `../anyoexpertportal` | TypeScript · Next.js 15 · pnpm | Expert-facing portal |
| anyo-portal | `../anyo-portal` | TypeScript · Angular 17 · npm | Admin portal |
| anyopwaui | `../anyopwaui` | TypeScript · Next.js 16 · pnpm | PWA UI |
| anyo-web-app | `../anyo-web-app` | TypeScript · Next.js 14 · npm | Web app (bridge/landing) |
| anyoauth | `../anyoauth` | Firebase (no package.json) | Auth service (SSO/IDP) |
| anyo-cloudflare-do | `../anyo-cloudflare-do` | TypeScript · Hono + Wrangler · npm | Cloudflare Durable Objects |
| anyoContentCalender | `../anyoContentCalender` | TypeScript · Next.js 15 · npm | Content calendar |
| anyopartnerportal | `../anyopartnerportal` | TypeScript · Next.js 15 · npm | Partner portal |
| anyo-strapi-cms | `../anyo-strapi-cms` | JavaScript · Strapi 4 · npm | CMS (Strapi) |

Each repo is its own git repository. The workspace root is **not** a git repo.

---

## Folder Model

The workspace supports both standalone tickets and optional epic parent folders.

Standalone ticket:

```text
aph-4321/
  state.yml
  README.md
  notes/
  scripts/
```

Epic with child tickets:

```text
aph-4200/
  state.yml
  README.md
  aph-4201/
    state.yml
    README.md
    notes/
    scripts/
  aph-4202/
    state.yml
    README.md
    notes/
    scripts/
```

Rule: one `state.yml` per work item.
- Standalone ticket -> one `state.yml`
- Epic -> one `state.yml`
- Child ticket -> one `state.yml`

---

## Starting a New Ticket

If the work is a standalone ticket:

```bash
cp -r _template/ aph-XXXX/
```

If the work belongs to an epic and the epic folder already exists:

```bash
cp -r _template/ aph-EPIC/aph-XXXX/
```

If the work belongs to an epic and the epic folder does not exist yet:

```bash
cp -r _epic_template/ aph-EPIC/
cp -r _template/ aph-EPIC/aph-XXXX/
```

For a ticket folder (`aph-XXXX/state.yml` for standalone, or `aph-EPIC/aph-XXXX/state.yml` for child tickets), fill in:
- `meta.jira`, `meta.title`, `meta.created`, `meta.owners`, `meta.repos_and_paths`
- Add tasks under `tasks:`

For an epic folder (`aph-EPIC/state.yml`), capture epic-level scope, shared decisions, child ticket references, and overall progress.

---

## Before Any Code Changes

At the start of every session, run `/session-start` to orient before doing anything else.

**Always identify the active ticket first.**

1. Ask: *"Which ticket are we working on?"* — check `state.yml` in the relevant ticket folder.
2. If no ticket exists yet:
   - Brainstorm and clarify requirements with the user first.
   - Create a Jira ticket (`APH-XXXX`).
   - Decide whether it is standalone work or part of an epic.
   - For standalone work, create `aph-XXXX/` from `_template/`.
   - For epic work, create or reuse the parent epic folder, then create the child ticket folder inside it.
3. Only after a ticket exists may any code changes be implemented.

**Never touch repo code without a ticket. No exceptions.**

---

## Dev Conventions

- **No TDD.** Do not write tests unless explicitly requested.
- **Prefer manual verification** with targeted lint/typecheck only when code is stable.
- **One agent edits `state.yml` at a time.** Parallel agents write findings to `notes/<agent>-update.md`; a single session merges into `state.yml`.
- **Epics summarize, tickets execute.** Keep epic `state.yml` files high level; keep task-by-task execution details in the child ticket `state.yml`.
- **Branch naming:** branch name = ticket number (`aph-XXXX`) in every relevant repo, branched from `origin/main`.
- **No secrets or PII** in any file under this workspace.
- **`state.yml` is the single source of truth** for each work item — epic, standalone ticket, or child ticket.
