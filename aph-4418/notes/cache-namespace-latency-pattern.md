# Cache namespace latency pattern

Date: 2026-03-19
Epic: APH-4418
Repo: `anyobackendapi`

## Question

Why does cache latency appear isolated to specific namespaces in Sentry, even when the operation is a cache fetch such as `GET PARTNER_CACHE::{PARTNER_CACHE}:...`?

## Key code observation

- `AnyoCacheService.createHashTaggedKey()` rewrites every key to `{NAMESPACE}:key` in `anyobackendapi/src/common/anyoCache/anyoCacheService.ts`.
- In Redis Cluster, keys with the same hash tag are forced into the same hash slot.
- Result: all keys inside one namespace are pinned to one shard/slot, so a hot namespace can become slower than other namespaces even when the rest of Redis looks healthy.

## Sentry namespace metrics

7d production spans:

| Namespace | Count | Avg ms | P95 ms | P99 ms |
| --- | ---: | ---: | ---: | ---: |
| `USER_CACHE` | 1,005,546 | 42.93 | 178.58 | 495.07 |
| `PARTNER_CACHE` | 120,015 | 36.76 | 149.75 | 468.42 |
| `THERAPIST_CACHE` | 36,398 | 35.21 | 141.55 | 429.04 |
| `MASTER_DATA_CACHE` | 27,306 | 28.79 | 112.08 | 389.23 |
| `USER_SUBSCRIPTION_CACHE` | 27,075 | 12.89 | 42.03 | 250.13 |
| `LYFIS_MASTER_DATA_CACHE` | 6,144 | 23.28 | 74.98 | 265.84 |
| `CIRCLE_PROFILE_GENERATION` | 3,888 | 12.82 | 43.25 | 205.73 |
| `DEFAULT_ANYO_CACHE` | 0 | - | - | - |
| `CONTENT_CACHE` | 0 | - | - | - |
| `KINESTEX` | 0 | - | - | - |
| `ANYO_ANNOTATIONS_CACHE` | 0 | - | - | - |
| `MEAL_LOADING_CACHE` | 0 | - | - | - |

24h production spans:

| Namespace | Count | Avg ms | P95 ms | P99 ms |
| --- | ---: | ---: | ---: | ---: |
| `USER_CACHE` | 119,194 | 32.19 | 153.66 | 317.36 |
| `PARTNER_CACHE` | 23,551 | 36.32 | 146.96 | 358.03 |
| `THERAPIST_CACHE` | 4,759 | 12.07 | 62.60 | 192.83 |
| `MASTER_DATA_CACHE` | 3,983 | 19.14 | 78.47 | 255.49 |
| `USER_SUBSCRIPTION_CACHE` | 2,348 | 6.03 | 10.27 | 100.91 |
| `LYFIS_MASTER_DATA_CACHE` | 1,063 | 12.65 | 40.62 | 196.13 |
| `CIRCLE_PROFILE_GENERATION` | 474 | 3.26 | 10.70 | 61.74 |

## Namespace skew seen in Sentry

- `USER_CACHE` is the hottest namespace by far and also the slowest at aggregate level.
- `PARTNER_CACHE` is materially slower than `MASTER_DATA_CACHE` and `USER_SUBSCRIPTION_CACHE` despite being a cache hit path.
- `THERAPIST_CACHE` shows a 7d tail similar to `PARTNER_CACHE`, but a much better 24h window, which suggests bursty namespace-local pressure rather than a uniformly slow cache tier.

## Hot key examples

`PARTNER_CACHE` 7d top keys:

- `GET PARTNER_CACHE::{PARTNER_CACHE}:id:PR-5245` - count `30,956`, avg `28.93ms`, p95 `110.15ms`, p99 `436.04ms`
- `GET PARTNER_CACHE::{PARTNER_CACHE}:id:PR-7968` - count `21,283`, avg `24.38ms`, p95 `111.71ms`, p99 `389.88ms`
- `GET PARTNER_CACHE::{PARTNER_CACHE}:id:PR-9008` - count `17,256`, avg `42.59ms`, p95 `184.13ms`, p99 `501.61ms`
- `GET PARTNER_CACHE::{PARTNER_CACHE}:id:PR-7279` - count `2,983`, avg `102.96ms`, p95 `486.54ms`, p99 `1219.52ms`

`USER_CACHE` 7d top keys:

- `GET USER_CACHE::{USER_CACHE}:tW6SltWYbFSBtAGrV6oRDMkcwNn1` - count `40,838`, avg `8.53ms`, p95 `26.09ms`, p99 `110.60ms`
- `GET USER_CACHE::{USER_CACHE}:giribala2001@gmail.com` - count `16,673`, avg `79.77ms`, p95 `245.49ms`, p99 `751.58ms`
- `GET USER_CACHE::{USER_CACHE}:uuxmywn@hi2.in` - count `15,120`, avg `66.45ms`, p95 `300.71ms`, p99 `622.83ms`

This suggests the latency is not only namespace-wide; some individual hot keys inside the namespace are materially worse than others.

## Route concentration

`PARTNER_CACHE` is concentrated in a few routes, including:

- `POST /app/u/v2/therapists` - count `31,461`, avg `33.37ms`, p95 `133.24ms`, p99 `426.86ms`
- `GET /getUserByEmail` - count `31,040`, avg `13.48ms`, p95 `50.99ms`, p99 `272.32ms`
- `POST /app/circles/grid/post` - count `16,455`, avg `42.24ms`, p95 `176.76ms`, p99 `445.35ms`
- `GET /app/partnerDetails` - count `8,254`, avg `47.03ms`, p95 `194.58ms`, p99 `489.45ms`
- `POST /admin/experts/sessions/grid` - count `3,670`, avg `143.91ms`, p95 `727.47ms`, p99 `2019.98ms`

This supports the earlier APH-4430 finding that partner cache reads can become a visible secondary bottleneck on grid-style endpoints.

## Likely reasons for namespace-isolated cache latency

1. **Single-slot namespace pinning**
   - All keys in a namespace share the same Redis Cluster hash tag.
   - A hot namespace therefore concentrates traffic onto one shard/slot.

2. **Hot-key concentration inside a namespace**
   - Sentry shows some keys are much hotter and slower than neighboring keys in the same namespace.
   - This can amplify contention for a namespace even when most keys are normal.

3. **Repeated per-request cache lookups**
   - Grid/list endpoints can perform repeated cache reads during response mapping.
   - APH-4430 already confirmed repeated partner lookups before batching was introduced.

4. **Payload-size / serialization variance**
   - Some namespaces store larger objects than others.
   - Sentry spans alone do not prove payload size, but the spread between keys suggests object-size or network-transfer differences may contribute.

5. **Instrumentation gap for newer namespaces**
   - `anyoCacheService.ts` defines newer namespaces such as `RHYTHM_RING_COPY_CACHE`, `RHYTHM_INSIGHTS_CACHE`, `SSO_EXCHANGE_CACHE`, and `SAML_SESSION_CACHE`.
   - `src/instrument.js` does not include those namespaces in `cachePrefixes`, so comparable Sentry visibility may be incomplete for them.

## Evidence-backed conclusion

The strongest explanation is not that cache misses are happening silently; it is that the cache design deliberately groups every key in a namespace into the same Redis Cluster slot, so latency can isolate by namespace. Sentry then shows additional skew from hot keys and request patterns that repeatedly hit the same namespace.

## Additional GCP evidence: connection resets are real and not explained by saturation alone

Read-only GCP investigation on `anyo-infra` / `anyo-gke-autopilot-as1` shows the production cache is an in-cluster Valkey deployment, not managed Memorystore.

What we observed:

- Valkey workload is `anyo-valkey-cache` in namespace `anyo-backend`.
- The container logs do not show memory pressure, OOM, or crash-loop behavior in the sampled windows.
- Valkey repeatedly logs normal RDB background save success messages.
- Around `2026-03-17T15:10:20Z`, the old Valkey pod logged `Received SIGTERM scheduling shutdown`, then `User requested shutdown`, then exited cleanly after saving RDB.
- A new Valkey pod came up and was `Ready to accept connections tcp` at `2026-03-17T15:10:38Z`.
- In the same window, `anyo-api` and `anyo-pubsub` logged repeated `SocketClosedUnexpectedlyError: Socket closed unexpectedly` from `@redis/client` under `AnyoCacheService`.

What this means:

- The observed connection-reset style cache errors line up with a Valkey pod replacement / endpoint cutover window.
- This is different from sustained cache-latency skew. It explains transient socket failures, not the broader namespace-level latency pattern.
- So we now have two separate cache-related phenomena:
  - steady-state namespace-local latency skew from namespace pinning + hot keys + repeated reads
  - transient Redis client socket errors during Valkey pod termination / restart windows

Important nuance:

- The user's dashboard observation that Valkey is barely used is compatible with this evidence.
- Low CPU/memory usage does not rule out brief connection interruptions during pod restarts, service endpoint flips, or graceful shutdown windows.

## Follow-up ideas

- If we want a full namespace audit, first align `src/instrument.js` with the full namespace enum so newer namespaces are observable in Sentry.
- For route work, treat cache spans as route-local evidence too: a namespace can be healthy globally but still hurt one endpoint if that endpoint performs repeated same-namespace reads.
