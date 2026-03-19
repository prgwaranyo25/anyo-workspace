# APH-4430 Expert Sessions Grid Design

**Ticket:** `APH-4430`

**Route:** `POST /admin/experts/sessions/grid`

**Problem**

Production traces show persistent tail latency on the expert sessions grid route. The slowest traces are dominated by backend DB work inside `anyobackendapi/src/core/service/gridService/sesionGridService.ts`, especially repeated multi-second `find({})` and `getMore` spans, plus smaller secondary partner-cache lookups.

**Approved Approach**

Keep the route contract unchanged and apply a backend-only optimization in the shared session-grid service.

**Design**

1. Scope plan and pack subscription reads to only the subscriptions referenced by the current page of session documents, instead of loading entire collections.
2. Batch partner enrichment by unique `partnerId` values across the current page and reuse the resolved partner names during response mapping.
3. Add an option so the expert route can skip `filterOptions` generation when the caller does not consume it, avoiding distinct and supporting queries on every request.
4. Leave route shape, auth model, and response data fields otherwise unchanged to keep the fix production-safe.

**Files In Scope**

- `anyobackendapi/src/core/handlers/therapist-portal-handler.ts`
- `anyobackendapi/src/core/service/gridService/sesionGridService.ts`
- `anyobackendapi/src/core/service/partnerService.ts` (read-only reference unless batching needs helper reuse)

**Expected Effect**

- Remove the worst full-collection reads that align with the slowest `find({})` and `getMore` spans.
- Reduce repeated partner cache reads per page.
- Reduce extra DB work for the expert route by skipping unused filter metadata.

**Verification**

- Run targeted lint/typecheck for the touched backend file(s).
- Manually verify the expert portal sessions page still loads.
- Use post-deploy Sentry comparison for route count/avg/p95/p99 and slow trace shape.
