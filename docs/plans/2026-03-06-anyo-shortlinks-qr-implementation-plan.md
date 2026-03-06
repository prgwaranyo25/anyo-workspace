# Anyo Short Links + QR (Dub-Lite) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Admin can create `https://anyo.co/<slug>` short links + QR codes with device targeting, UTM builder, tags/comments, and OG-only share preview overrides.

**Architecture:** Store link records in `anyobackendapi` (Mongo). `anyo-web-app` resolves `/<slug>` server-side: returns OG HTML for crawlers and `302` redirects for users. `anyo-portal` admin UI provides create/list/disable and QR download.

**Tech Stack:** TypeScript, Express, MongoDB driver (backend), Next.js Pages Router (web), Angular (admin portal).

---

Notes / Conventions
- Repo convention: do not add tests unless explicitly requested. This plan uses manual verification steps instead.
- Workspace root is not a git repo; commits (if desired) happen per-repo.

### Task 1: Backend - Add ShortLink types + collection

**Files:**
- Modify: `anyobackendapi/src/common/services/db.ts`
- Create: `anyobackendapi/src/core/models/AnyoShortLink.ts`

**Step 1: Add collection constant**
- In `anyobackendapi/src/common/services/db.ts`, add `Collections.ANYO_SHORT_LINKS = "anyoShortLinks"` (name can be adjusted, but keep stable).

**Step 2: Add model types**
- Create `anyobackendapi/src/core/models/AnyoShortLink.ts`:
  - `AnyoShortLinkDocument` with fields: `domain`, `key`, `url`, `ios?`, `android?`, `utm?`, `og?`, `tags`, `comments?`, `createdByAdminUserId`, `createdAt`, `disabledAt?`.
  - Export helper types for create/update payloads.

**Step 3: Manual verification**
- Run TypeScript typecheck/build for backend (use whatever command repo already uses).

### Task 2: Backend - CRUD + resolve endpoints

**Files:**
- Create: `anyobackendapi/src/core/service/shortLinkService.ts`
- Create: `anyobackendapi/src/core/handlers/admin-shortlinks-handler.ts`
- Create: `anyobackendapi/src/core/handlers/public-shortlinks-handler.ts`
- Modify: `anyobackendapi/src/core/routes/index.ts`

**Step 1: Implement allowlist + slug validation**
- In `anyobackendapi/src/core/service/shortLinkService.ts`, implement:
  - `validateAllowedUrl(hostAllowlist, urlString)`
  - `validateSlug(key)` (lowercase, alnum + `-`, length limits)
  - `validateReservedSlug(key)` using a reserved list (start with `app`, `api`, `blog`, `faq`, `privacy-policy`, `terms-and-conditions`, `about-us`, `contact-us`, `login`, `sign-up`, `events`, `survey`, `v`, `studio`, `business`, `trust-and-security`, `checkout`, `forgot-password`, `careers`, `circles`).

**Step 2: Create short link (admin)**
- In `anyobackendapi/src/core/handlers/admin-shortlinks-handler.ts` implement `POST /admin/short-links`:
  - Auth: `checkAuthFirebaseMethod(true)` + `checkRole(Roles.Admin)` (or a tighter permission if desired).
  - Get admin user: `getRealAnyoUser()` from `anyobackendapi/src/core/service/userService.ts`.
  - Validate allowlists:
    - `url` host in `{ anyo.app, anyo.co }`
    - `ios` host in `{ apps.apple.com }` (optionally include `itunes.apple.com`)
    - `android` host in `{ play.google.com }`
  - If `key` not provided, generate random (7 chars) and ensure unique.
  - Insert document and return created record (include `shortLink` convenience string like `https://anyo.co/<key>`).

**Step 3: Grid/list short links (admin)**
- Implement `POST /admin/short-links/grid` with basic filters:
  - search by `key` or `url`
  - filter by `disabled` status
  - paginate and sort `createdAt desc`

**Step 4: Disable/enable (admin)**
- Implement:
  - `POST /admin/short-links/:id/disable` sets `disabledAt = now`
  - `POST /admin/short-links/:id/enable` sets `disabledAt = null`

**Step 5: Resolve short link (public)**
- In `anyobackendapi/src/core/handlers/public-shortlinks-handler.ts` implement `GET /public/short-links/resolve`:
  - Inputs: `domain`, `key`
  - Output: minimal JSON containing `url`, `ios`, `android`, `utm`, `og`, `disabled`.
  - Return 404 if not found or disabled.

**Step 6: Wire routes**
- In `anyobackendapi/src/core/routes/index.ts`, mount:
  - Admin: `/admin/short-links`, `/admin/short-links/grid`, `/:id/disable`, `/:id/enable`
  - Public: `/public/short-links/resolve`

**Step 7: Manual verification**
- Run backend locally.
- Call endpoints with curl/Postman.
  - Create link -> ensure `https://anyo.co/<slug>` returned.
  - Resolve -> returns allowlisted targets and OG/UTM.
  - Disable -> resolve returns 404.

### Task 3: Web - `https://anyo.co/<slug>` SSR resolve + OG-only preview

**Files:**
- Modify: `anyo-web-app/src/pages/[...deepLink].tsx`

**Step 1: Convert to SSR flow**
- Add `getServerSideProps(context)`.
- Extract path segments from `context.params.deepLink`.

**Step 2: If single segment, attempt resolve**
- If exactly one segment:
  - Call backend: `GET https://apiv3.anyo.app/public/short-links/resolve?domain=anyo.co&key=<slug>`.
  - If 404: fall back to existing behavior (mobile -> store, desktop -> `https://anyo.app/app`).

**Step 3: Detect crawler UA**
- Use `context.req.headers['user-agent']` to match common crawlers.
- If crawler:
  - Render a minimal page component that sets `<Head>` meta tags using resolved OG fields.
  - Add `<meta httpEquiv="refresh" content="0;url=<finalUrl>" />`.

**Step 4: Non-crawler redirect**
- Choose redirect target based on platform:
  - Determine iOS/Android from user-agent.
  - Prefer `ios`/`android` overrides when present; otherwise `url`.
- Apply UTM params when redirecting to `url`.
- Return `redirect: { destination, permanent: false }`.

**Step 5: Manual verification**
- Locally run `anyo-web-app`.
- Verify:
  - Desktop: `http://localhost:<port>/<slug>` 302s to `url`.
  - Mobile UA: 302s to store when override set.
  - Crawler UA: returns HTML with OG meta (view source) and refresh.

### Task 4: Admin Portal - UI for create/manage + QR download

**Files:**
- Modify: `anyo-portal/projects/app-core/src/service/network-utils.service.ts`
- Create: `anyo-portal/projects/admin/src/app/services/short-links.service.ts`
- Create: `anyo-portal/projects/admin/src/app/pages/short-links/short-links.module.ts`
- Create: `anyo-portal/projects/admin/src/app/pages/short-links/short-links-routing.module.ts`
- Create: `anyo-portal/projects/admin/src/app/pages/short-links/create/create.component.{ts,html,scss}`
- Create: `anyo-portal/projects/admin/src/app/pages/short-links/manage/manage.component.{ts,html,scss}`
- Modify: `anyo-portal/projects/admin/src/app/app-routing.module.ts`
- Modify: `anyo-portal/projects/admin/src/app/pages/main-layout/main-layout.component.ts`

**Step 1: Add backend URLs**
- In `anyo-portal/projects/app-core/src/service/network-utils.service.ts` add:
  - `URL_DICT.adminShortLinksCreate = environment.apiBackendBaseUrl + '/admin/short-links'`
  - `URL_DICT.adminShortLinksGrid = environment.apiBackendBaseUrl + '/admin/short-links/grid'`
  - `URL_DICT.adminShortLinksDisable = environment.apiBackendBaseUrl + '/admin/short-links/'` (append `:id/disable`)
  - `URL_DICT.adminShortLinksEnable = environment.apiBackendBaseUrl + '/admin/short-links/'` (append `:id/enable`)

**Step 2: ShortLinksService**
- Create `anyo-portal/projects/admin/src/app/services/short-links.service.ts` using `NetworkUtilsService`:
  - `create(payload)`
  - `grid(payload)`
  - `disable(id)`
  - `enable(id)`

**Step 3: Create/manage components**
- Create screen (Dub-like):
  - Destination URL + optional custom slug
  - Device targeting toggle + iOS/Android URLs (pre-fill with store URLs)
  - UTM builder fields
  - OG preview fields (title/description/image URL)
  - Tags input (comma separated) + Comments
  - On success: show short link and QR preview + download

**Step 4: QR generation**
- Add a QR library dependency in `anyo-portal` (e.g. `qrcode` or an Angular QR component) and implement download as PNG.

**Step 5: Routing + menu**
- Add new route group under admin:
  - `/short-links/create`
  - `/short-links/manage`
- Add menu entry in `anyo-portal/projects/admin/src/app/pages/main-layout/main-layout.component.ts` gated by `Roles.Admin`.

**Step 6: Manual verification**
- Run admin portal locally.
- Create link, verify it appears in grid, disable/enable works.
- Download QR and scan; confirm it lands on `https://anyo.co/<slug>`.

### Task 5: Deploy / Ops Checklist

**Files:**
- None (documentation only)

**Step 1: Ensure `anyo.co` points to `anyo-web-app` deployment**
- Confirm existing marketing routes still work (`/app`, `/blog`, etc.).

**Step 2: Add reserved slug list updates if collisions discovered**
- Keep a short allowlist approach: better to reserve too much than break public pages.

---

Execution Options
1) Subagent-driven (this session): implement repo-by-repo with review checkpoints.
2) Parallel session: run `executing-plans` in a dedicated worktree and follow tasks sequentially.
