# APH-4253 Security + Feasibility Review (Read-Only Notes)

This note captures a 2-agent review of `aph-4253/state.yml` and the multi-repo plan.

Important
- This file is *not* the source of truth; `aph-4253/state.yml` is.
- These are proposed corrections / blockers to apply to `state.yml` when approved.

## Security checks to implement (top)
- Bridge `returnTo`: treat as fixed. Either ignore caller `returnTo` and always use `decisions.pwa_callback_url`, or require exact-match with strict URL parsing.
- Provider validation: Bridge only accepts `providerId` starting `saml.` and backend `/auth/sso/exchange` verifies the ID token actually came from the requested SAML provider.
- Bridge state/nonce: store `{state, nonce, providerId}` in a way that survives IdP return (avoid `SameSite=Strict` cookies). Enforce single-use.
- One-time code: high entropy, single-use, short TTL (2-5 min), atomic consume. Bind to `uid + providerId + nonce + uaHash`.
- Abuse controls: rate limit `/app/* auth-mode`, `/auth/sso/exchange`, `/auth/sso/redeem`.
- Enumeration: ensure auth-mode decision depends only on email domain config; avoid returning partner identifiers unless required.
- Certificate safety: validate size/format; never log/store cert body; store only fingerprint/ref.

## Feasibility blockers / mismatches to fix in state.yml (pending approval)
- Backend unauth path convention: state.yml uses `/app/un-auth/...` but backend convention is `/app/u/...` (e.g. `/app/u/whitelisted-domains`).
- Admin partner path convention: state.yml uses `/admin/partners/...` but backend/portal convention appears to be `/admin/partner/...` (singular).
- Redeem response shape: existing clients generally expect `{ token }` for Firebase custom token flows; state.yml currently returns `{ customToken }`.
- PWA middleware: callback route must be explicitly exempt from auth-redirect middleware until redeem completes, otherwise `code` can be lost.
- Installed PWA behavior: navigating from `/app/...` to `/sso/...` (outside PWA scope) and back to `/app/auth/sso/callback` may vary by platform. Must be mocked early.

## Proposed state.yml deltas (minimal)
- `backend_api_contracts.app_un_auth.LookupAuthModeByEmail`:
  - change to `POST /app/u/auth-mode` with input `{ email }`
  - minimize response to `{ mode, domain, providerId?, bridgeStartUrl? }`
- `backend_api_contracts.admin.*.path`:
  - change `/admin/partners/...` -> `/admin/partner/...`
- `backend_api_contracts.sso_handoff.SsoRedeem.output`:
  - change `{ customToken, ... }` -> `{ token, ... }`
- `backend_api_contracts.sso_handoff.SsoExchange.input`:
  - remove or mark `returnToOrigin` as server-derived/validated (never trusted)
- Task acceptance:
  - add provider verification requirement on exchange
  - add PWA middleware exemption requirement for callback page

## Mock-first tests to de-risk
- Mock loop: PWA `/app/auth` -> Bridge `/sso/azure/start` -> PWA `/app/auth/sso/callback?code=MOCK`.
- Run in: normal browser + installed PWA (Android + iOS if applicable).
