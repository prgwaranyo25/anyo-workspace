# Cache observations

Date: 2026-03-19
Ticket: APH-4431
Parent epic: APH-4418
Repo: `anyobackendapi`

## Scope

Record the observed cache behavior around `PARTNER_CACHE`, namespace-local latency skew, and transient cache connection-reset events seen in GCP logs.

## What we know

### 1. `PARTNER_CACHE` is slower in some routes, not everywhere

- The same cache key can be very fast in one route and multi-second in another.
- Example key: `GET PARTNER_CACHE::{PARTNER_CACHE}:id:PR-9008`
- `GET /getUserByEmail` (30d): count `25,978`, avg `7.75ms`, p95 `16.78ms`, p99 `170.21ms`
- `POST /admin/experts/sessions/grid` (30d): count `2,392`, avg `131.94ms`, p95 `641.24ms`, p99 `1609.88ms`
- `POST /app/circles/grid/post` (30d): count `9,273`, avg `51.77ms`, p95 `193.55ms`, p99 `479.58ms`

Interpretation:

- The key itself is not universally slow.
- The route/request shape strongly affects the observed cache span duration.

### 2. Multi-second outliers happen inside already-slow traces

- Sentry shows the same `PR-9008` cache key with spans up to `4.06s`.
- Those outliers appear in heavy routes such as `POST /admin/experts/sessions/grid` and `POST /app/circles/grid/post`.
- Example trace groups for `POST /admin/experts/sessions/grid` include repeated occurrences of the same key in one trace:
  - trace `84b9477aca15471e9f7f21a329afd8f9`: count `7`, avg `3531.67ms`, max `3531.92ms`
  - trace `38ebe3492152c2d009ec962047131adf`: count `1`, avg `4056.45ms`

Interpretation:

- The multi-second cache span does not mean Valkey needed 3-4 seconds to locate a single key in isolation.
- It means the cache read completed very late inside a slow request path.

### 3. Repeated partner lookups exist in route code

- `anyobackendapi/src/core/service/gridService/sesionGridService.ts:645` fetches partner details during row mapping:

```ts
partnerName: user.partnerId
  ? (await getPartnerDetailsByPartnerId(user.partnerId))?.companyName
  : "N/A",
```

- `anyobackendapi/src/core/service/partnerService.ts:672` shows `getPartnerDetailsByPartnerId()` does a cache read first from `PARTNER_CACHE`.

Interpretation:

- Large grid/list handlers can re-fetch partner data while constructing many rows.
- That makes cache latency request-shape dependent even when the cache server is healthy.

### 4. Shared namespace design can still isolate pressure

- `anyobackendapi/src/common/anyoCache/anyoCacheService.ts:42` rewrites keys as `{NAMESPACE}:key`.
- This groups all keys in one namespace under one Redis hash tag / slot grouping behavior.
- Result: namespace-local pressure is possible even when overall cache usage looks low.

### 5. Transient connection-reset events are separate from steady-state latency

- Read-only GCP logs show prod cache is an in-cluster Valkey deployment: `anyo-valkey-cache`.
- Around `2026-03-17T15:10:20Z`, the old Valkey pod received `SIGTERM`, shut down cleanly, and a new pod became ready around `2026-03-17T15:10:38Z`.
- In the same window, `anyo-api` and `anyo-pubsub` logged `SocketClosedUnexpectedlyError` from `@redis/client` under `AnyoCacheService`.

Interpretation:

- These reset/socket-close events explain transient cache failures.
- They do not explain the broader route-specific `PARTNER_CACHE` latency pattern.

## Working conclusion

- `PARTNER_CACHE` is not slow simply because Valkey is overloaded.
- The stronger explanation is that some heavy routes repeatedly look up the same partner cache entries during slow request processing.
- Route-local request shape and repeated reads appear to dominate the worst outliers.
- Separate from that, Valkey pod replacement windows can cause brief socket-close / connection-reset cache errors.

## Open questions

- In the slowest traces, how much of the cache span is true Redis/network time vs waiting inside a congested request path?
- Which remaining routes still repeat same-partner lookups after APH-4430's batching changes?
- Does current instrumentation over-attribute request waiting time to cache spans in some traces?
