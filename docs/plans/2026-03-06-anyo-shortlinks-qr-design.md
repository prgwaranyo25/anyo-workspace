# Anyo Short Links + QR (Dub-Lite) Design

Goal
- Let Admin users create Anyo-controlled short links on `https://anyo.co/<slug>` and download QR codes for them.
- Prevent 3rd-party QR hijacking/interstitial ads by ensuring scans hit an Anyo-owned domain first.

Phase 1 Scope
- Admin portal UI to create/manage links
  - Destination URL (required)
  - Device targeting: iOS override URL, Android override URL (optional; default to Anyo store URLs)
  - UTM builder fields (optional)
  - OG-only link preview override (optional): title/description/image
  - Tags (optional)
  - Comments (optional)
  - Disable/enable (revoke)
  - Download QR code (PNG)
- Public routing on `anyo.co`
  - Normal users: immediate redirect (302)
  - Crawlers (share previews): return HTML with OG tags (200)

Phase 2 (Explicitly Out of Scope)
- Scan analytics dashboard (PostHog events, attribution, conversion tracking)
- Geo targeting, A/B tests, password protection, expiration dates
- Full proxy/landing page for all users (only OG-only crawler response in phase 1)

Key Product Decisions
- Public shortlink domain: `anyo.co`
- Slugs: allow both custom slug and auto-generate by default
- Mobile fallback when app not installed: send to App Store / Play Store when overrides are set (Dub-style)

Existing Context (Why this approach)
- `anyo-web-app/` is a Next.js Pages Router site.
- It already has a catch-all page: `anyo-web-app/src/pages/[...deepLink].tsx` with platform detection and store redirects.
- We will extend this catch-all to handle `https://anyo.co/<slug>` in a backwards-compatible way.

Data Model (Backend)
- Collection: new Mongo collection for short links (name TBD, e.g. `anyoShortLinks`).
- Document fields (minimum):
  - `domain`: string (phase 1 fixed to `anyo.co`)
  - `key`: string (slug)
  - `url`: string (required; allowlisted)
  - `ios`: string | null (optional; allowlisted)
  - `android`: string | null (optional; allowlisted)
  - `utm`: optional object
    - `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
  - `og`: optional object
    - `title`, `description`, `imageUrl`
  - `tags`: string[]
  - `comments`: string | null
  - `createdByAdminUserId`: string
  - `createdAt`: Date
  - `disabledAt`: Date | null

Validation / Security
- Destination allowlist:
  - `url`: host must be `anyo.app` or `anyo.co`
  - `ios`: host must be `apps.apple.com` (optionally also allow legacy `itunes.apple.com`)
  - `android`: host must be `play.google.com`
- Reserved slugs: block any slug that collides with existing `anyo-web-app` top-level routes (e.g. `app`, `api`, `blog`, `faq`, etc.). The reserved list can be hardcoded for phase 1 and expanded safely.
- Ownership/audit: creation is tied to the authenticated admin user.

Redirect Algorithm
Inputs
- `slug` from path `/<slug>`
- `user-agent` from request headers

Outputs
- Either `302` redirect to final URL (normal user)
- Or `200` HTML with OG meta tags (crawler)

Normal user redirect selection
- iOS: if `ios` exists -> redirect to `ios` else redirect to `url`
- Android: if `android` exists -> redirect to `android` else redirect to `url`
- Desktop/other: redirect to `url`

UTM application
- If redirecting to `url` (web/universal link), append stored UTM params.
- For simplicity in phase 1: if destination already has `utm_*`, overwrite with stored values when provided.

OG-only preview handling
- If request user-agent matches common social crawlers (Facebook, Twitter/X, LinkedIn, Slack, Discord, WhatsApp, Telegram), respond with HTML including:
  - `og:title`, `og:description`, `og:image`, `og:url`
  - `twitter:card` (e.g. `summary_large_image`) and `twitter:title/description/image`
- Response contains a `<meta http-equiv="refresh" ...>` fallback to the final redirect URL.
- No visible interstitial UI.

Public Routing Implementation (anyo-web-app)
- Extend `anyo-web-app/src/pages/[...deepLink].tsx` to use `getServerSideProps`.
- If path is exactly 1 segment (candidate slug):
  - Resolve slug via backend public resolve endpoint.
  - If found + not disabled:
    - If crawler UA: render OG HTML response
    - Else: return redirect response
  - If not found/disabled: fall back to existing deep-link redirect behavior.

Backend API Surface
Admin (auth required)
- `POST /admin/short-links` create
- `POST /admin/short-links/grid` list/filter (reuse existing grid patterns)
- `POST /admin/short-links/:id/disable` disable
- `POST /admin/short-links/:id/enable` enable (optional)

Public (no auth)
- `GET /public/short-links/resolve?domain=anyo.co&key=<slug>`
  - returns minimal data needed by `anyo-web-app`: selected destinations and OG meta.

Admin UI (anyo-portal)
- New section under main layout (e.g. "Links" or "Short Links")
  - Create form (Dub-like)
  - List/manage page with disable + copy link + download QR
- QR generation: generate client-side PNG (no backend image storage required). Store only the short URL and config.

Analytics
- Phase 1: none (except existing server logs)
- Phase 2: emit PostHog events from redirect handler (`shortlink_clicked`) and optionally store aggregate counters.
