# APH-4418 App Route Inventory

Date: 2026-03-18

## Scope

- Phase 1 covers app APIs only.
- Inventory starts at `anyobackendapi/src/server.ts`.
- Included mounted routers:
  - `anyobackendapi/src/core/routes/index.ts`
  - `anyobackendapi/src/anyo-circles/routes/appRoutes.ts`
  - `anyobackendapi/src/anyo-lyfis/routes/appRoutes.ts`
  - `anyobackendapi/src/anyo-rhythm/routes/appRoutes.ts`

## Inventory Summary

- Raw app route registrations: `250`
- Unique concrete app routes: `248`
- Included unauth app routes under `/app/u/*`: yes

## Largest Route Groups By Unique Count

- `circles`: 26
- `physical-fitness`: 18
- `rhythm`: 15
- `groups`: 11
- `meal-tracker`: 11
- `packs`: 11
- `v2`: 11
- `lyfis`: 10
- `u`: 10
- `events`: 8
- `labReports`: 8
- `forums`: 7
- `talks`: 7

## Notable Inventory Notes

- `src/anyo-lyfis/routes/appRoutes.ts` registers duplicate GET routes for:
  - `/app/lyfis/global-insights`
  - `/app/lyfis/get/shared/items`
- `src/server.ts` also mounts non-app routers such as admin, MCP, and webhook paths, but those are excluded from this phase.

## Sentry-Guided App Priority Candidates

These are the current app-focused routes that stand out from `span.op:http.server environment:production` analysis.

### Highest user-impact booking and session flows

- `POST /app/bookAppointment`
- `POST /app/v2/therapy/plans/checkout`
- `POST /app/v2/therapy/plan`
- `GET /app/therapist/slots/:id`

### High-volume app reads with meaningful tail latency

- `POST /app/forums/v2/grid`
- `GET /app/rhythm/flow/card`
- `GET /app/rhythm/flow/insights`
- `POST /app/therapist/meta/batch`

### AI or chat-heavy app flows

- `POST /app/packs/assessment/chat`
- `POST /app/therapy/expert-chat`
- `POST /app/therapy/expert-chat/send`
- `POST /app/therapy/expert-chat/unread`

### Write-heavy profile or update flows

- `POST /app/profile/update`
- `POST /app/circles/profile/update`
- `GET /app/circles/generateProfileName`
- `POST /app/updateAppointment`
- `POST /app/v2/healthMetrics/update/steps`

## Next Step

Use this inventory to group only app APIs into child tickets after finishing app-only Sentry prioritization.

## Route-Per-Child Strategy

- Each route will become its own child ticket.
- Buckets are now only an epic-level way to organize observations and priority.
- We will not batch multiple production route fixes into a single child ticket.

## First Route Candidates

| Priority | Route | Bucket | Count 7d | Avg ms | p95 ms | p99 ms |
|---|---|---:|---:|---:|---:|---:|
| 1 | `POST /app/bookAppointment` | booking-session | 158 | 6422 | 10557 | 26669 |
| 2 | `POST /app/packs/assessment/chat` | ai-chat | 69 | 12848 | 21571 | 25854 |
| 3 | `POST /app/v2/healthMetrics/update/steps` | profile-update-write-heavy | 17 | 10373 | 30743 | 31070 |
| 4 | `POST /app/updateAppointment` | profile-update-write-heavy | 30 | 12285 | 30000 | 30118 |
| 5 | `POST /app/circles/profile/update` | profile-update-write-heavy | 132 | 5415 | 15219 | 21628 |
| 6 | `GET /app/circles/generateProfileName` | profile-update-write-heavy | 445 | 6279 | 11279 | 16650 |
| 7 | `GET /app/therapist/slots/:id` | booking-session | 578 | 1580 | 5426 | 8402 |
| 8 | `POST /app/v2/therapy/plans/checkout` | booking-session | 445 | 811 | 5017 | 8481 |
| 9 | `POST /app/therapist/meta/batch` | high-volume-read-list | 1266 | 2802 | 5933 | 7204 |
| 10 | `GET /app/rhythm/flow/card` | high-volume-read-list | 13048 | 808 | 4047 | 9207 |
| 11 | `GET /app/rhythm/flow/insights` | high-volume-read-list | 2922 | 1279 | 3824 | 10543 |
| 12 | `POST /app/forums/v2/grid` | high-volume-read-list | 16488 | 1053 | 3303 | 6693 |

## Observation Policy

- Shared patterns, hypotheses, and cross-route notes stay in `aph-4418/`.
- Each child ticket should contain only route-specific evidence, bottlenecks, fix plan, and verification steps.
