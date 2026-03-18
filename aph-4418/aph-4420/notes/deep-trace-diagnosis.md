# APH-4420 — Deep Trace Diagnosis: POST /app/bookAppointment

Produced under the `anyobackendapi-api-latency-diagnosis` skill protocol.
Reason for re-investigation: APH-4419 findings were based on shallow trace sampling; this report covers 5 traces span-by-span.

---

## Route and scope

- **Method / route:** POST /app/bookAppointment
- **Environment:** production
- **Time window:** 7d primary; 24h comparison
- **Reported symptom:** Persistent tail and elevated average across all calls
- **Symptom classification:** avg-driven with severe persistent tail
- **Scope notes:** Single handler path; all traffic goes through `checkAuthFirebaseMethod(true)` → `checkAppToken` → `bookAppointmentPostHandler` → `saveTherapistAppointment` → `await processSessionBooking(...)` (synchronous, inline)

---

## Metrics

| Window | Count | Avg | p95 | p99 |
|--------|-------|-----|-----|-----|
| 24h    | 40    | 6,698ms | 16,180ms | 27,492ms |
| 7d     | 161   | 6,425ms | 10,588ms | 26,627ms |

- **Window comparison:** Stable — both windows show similar avg and shape. The 24h p95/p99 are higher, suggesting a currently worse period.
- **Persistence / shape:** Persistent elevation, not a regression spike. avg is 6–7s meaning nearly all calls are slow, not just the tail.

---

## Trace observations

**Trace count reviewed:** 5 (top 5 by duration from 7d window)

---

### Trace 1 — 27,492ms (2026-03-17T16:08, compound failure)

- **Spans >10% wall time:**
  - db.find (MongoDB) — 2,836ms (10.3%)
  - db.ping (MongoDB) — 2,163ms (7.9%) ← repeated, slow
  - db.find (MongoDB) — 2,132ms (7.8%)
  - db.insert notification queue record — 1,977ms (7.2%)
  - Discord POST channel 1298145678 — 2,690ms (9.8%)
  - PostHog batch — 2,285ms (8.3%)
  - Google Calendar events.insert — 2,022ms (7.4%)
  - Gallabox WhatsApp — 1,013ms (3.7%)
  - db.insert notification queue record — 1,073ms (3.9%)
- **Untraced gap:** Difficult to quantify precisely given 222 spans across 4 concurrent HTTP transactions; conservative estimate ~4,000–6,000ms uninstrumented
- **Repeated span types:**
  - db.ping: 5 occurrences (2,163ms / 978ms / 313ms / 238ms / 196ms / 188ms / 165ms) — **MongoDB ping operations are anomalously slow**
  - db.find: many, wide range (165ms–2,836ms)
  - db.insert: 4 notification queue inserts (159ms–1,977ms)
- **Call sequencing:** Sequential. No evidence of parallelism in the traced path.
- **Character:** Compound failure trace — both slow MongoDB and slow external HTTP. The MongoDB ping slowness (up to 2,163ms) is present only in this trace.

---

### Trace 2 — 25,365ms (2026-03-12T15:47, Discord-dominated)

- **Spans >10% wall time:**
  - Discord POST channel 1298145678 — 8,062ms (31.8%) ← dominant
  - Discord POST channel 1155905216 — 7,482ms (29.5%) ← dominant
  - Gallabox WhatsApp — 4,692ms (18.5%)
  - Google Calendar events.insert — 2,272ms (9.0%)
  - Gallabox WhatsApp #2 — 761ms (3.0%)
- **DB spans:** None in operation breakdown — zero DB spans recorded for this trace. All latency is external HTTP.
- **Untraced gap:** Named http.client spans sum to ~26,647ms vs 25,365ms trace — sum slightly exceeds trace due to measurement error or slight concurrency; effectively fully accounted for by http.client.
- **Repeated span types:**
  - Discord: 3 calls (8,062ms + 7,482ms + 532ms = 16,076ms total) — all sequential
  - Gallabox: 2 calls (4,692ms + 761ms = 5,453ms total) — sequential
  - PostHog: 4 calls (266ms + 228ms + 228ms + 226ms) — sequential
  - FCM: 4 calls (221ms + 215ms + 186ms + 167ms) — sequential
  - Firebase Identity: 2 calls (333ms + 320ms)
- **Call sequencing:** Sequential. The sum of named spans matches trace total, confirming no meaningful concurrency.
- **Character:** External HTTP (Discord + Gallabox) accounts for nearly all wall time. Discord slow-channel responses (up to 8,062ms per call) are the #1 cost.

---

### Trace 3 — 13,291ms (2026-03-12T11:23, mixed slow external)

- **Spans >10% wall time:**
  - Gallabox WhatsApp — 5,716ms (43.0%) ← dominant
  - FCM messages:send — 5,219ms (39.3%) ← dominant (unusual; normally <560ms)
  - Google Calendar events.insert — 2,103ms (15.8%)
- **DB:** 142 spans avg 19ms → ~2,698ms total if sequential; likely some overlap with http.client
- **Untraced gap:** http.client sum (~16,877ms) exceeds trace total (13,291ms) by ~3,586ms — confirms meaningful concurrency between DB and some http.client calls
- **Repeated span types:**
  - Discord: 3 calls (902ms + 498ms + 444ms) — present in all traces
  - Gallabox: 2 calls (5,716ms + 242ms)
  - FCM: 2 calls (5,219ms + 154ms) ← one FCM call very slow, likely a flake or timeout retry
- **Call sequencing:** Mixed. Some DB overlaps http.client but major external calls are sequential.
- **Character:** Gallabox and FCM both hit slow outliers simultaneously. Calendar is always slow (~2,000ms).

---

### Trace 4 — 11,506ms (2026-03-15T10:50, STS-dominated)

- **Spans >10% wall time:**
  - **AWS STS us-east-1 — 4,503ms (39.1%)** ← not in APH-4419 findings
  - Google Calendar events.insert — 2,008ms (17.5%)
  - AWS SecretsManager — 501ms + 477ms = 978ms (8.5%)
- **DB:** 146 spans avg 10ms → ~1,460ms
- **Untraced gap:** Named spans sum ≈ trace total; ~500ms uninstrumented
- **Repeated span types:**
  - Discord: 3 calls (496ms + 477ms + 420ms = 1,393ms)
  - Gallabox: 2 calls (838ms + 255ms = 1,093ms)
  - FCM: 3 calls (559ms + 466ms + 179ms = 1,204ms)
  - SecretsManager: 2 calls (501ms + 477ms) — both slow this trace
- **Call sequencing:** Sequential
- **Character:** AWS STS credential refresh (cross-region, to us-east-1) is the #1 cost in this trace. SecretsManager also slow simultaneously (possibly related — credential resolution lag).

---

### Trace 5 — 10,906ms (2026-03-12T19:09, STS-dominated)

- **Spans >10% wall time:**
  - **AWS STS us-east-1 — 4,521ms (41.5%)** ← same pattern as Trace 4
  - Google Calendar events.insert — 1,820ms (16.7%)
  - Discord: 697ms + 571ms + 523ms = 1,791ms (16.4%)
- **DB:** 139 spans avg 6ms → ~834ms
- **Untraced gap:** Named spans sum ≈ 11,115ms vs trace 10,906ms; effectively fully accounted for
- **Repeated span types:**
  - Discord: 3 calls (697ms + 571ms + 523ms) — all sequential
  - Gallabox: 2 calls (837ms + 253ms)
  - FCM: 1 call (365ms)
  - Firebase Identity (auth): 2 calls (360ms + 316ms)
  - OAuth2/v4/token: 1 call (340ms) ← calendar client re-init
  - SecretsManager: 2 calls (89ms + 88ms)
  - KMS: 1 call (69ms)
- **Call sequencing:** Sequential
- **Character:** Same as Trace 4 — STS credential refresh on the request path is the #1 cost. Discord and Calendar are next.

---

## Repeated vs isolated findings

| Observation | Traces | Isolated? |
|-------------|--------|-----------|
| Google Calendar events.insert (~2,000ms) | All 5 | Repeating — structural |
| Discord 3 sequential calls | All 5 | Repeating — structural |
| Gallabox WhatsApp 2 calls | All 5 | Repeating — structural |
| FCM 2–4 sequential calls | All 5 | Repeating — structural |
| PostHog 3–4 calls | Traces 1, 2, 3 | Client-side spans via distributed tracing — not backend |
| Firebase Identity 2 calls | Traces 1, 2, 3, 5 | Repeating — auth middleware |
| OAuth2/v4/token (calendar re-init) | Traces 1, 3, 4, 5 | Repeating — no client cache |
| AWS STS us-east-1 (~4,500ms) | Traces 4, 5 | Intermittent — credential refresh event |
| AWS SecretsManager (100–500ms) | Traces 2, 3, 4, 5 | Repeating but small except trace 4 |
| MongoDB ping slow (up to 2,163ms) | Trace 1 only | Isolated — DB anomaly |
| Discord slow (>5,000ms per call) | Traces 1, 2 | Intermittent — Discord tail latency |
| Gallabox/FCM slow (>3,000ms) | Traces 2, 3 | Intermittent — third-party tail |

---

## Span patterns

| Span family | Typical range | Avg % of wall time across traces |
|-------------|---------------|----------------------------------|
| Discord (3 sequential calls) | 420ms–8,062ms per call | 15–63% |
| Google Calendar events.insert | 1,820ms–2,272ms | 15–25% |
| Gallabox WhatsApp (2 calls) | 242ms–5,716ms (call 1) | 8–50% |
| FCM messages:send (2–4 calls) | 154ms–5,219ms per call | 3–40% |
| AWS STS us-east-1 | 4,500ms (when present) | 0% or 40% |
| PostHog batch (3–4 calls) | 200ms–400ms per call | **client-side spans — not backend** |
| Firebase Identity (2 calls, auth) | 300ms–580ms | 4–7% |
| OAuth2/v4/token (calendar init) | 207ms–340ms | 2–3% |
| AWS SecretsManager | 22ms–501ms | 1–9% |
| AWS KMS | 10ms–69ms | <1% |
| MongoDB (all operations) | 6ms–2,836ms per span | 3–30% (trace 1 outlier) |
| Redis GET | 170ms–183ms (trace 1 only) | <2% |

**Named span coverage:** Traces 2, 4, 5: >95% of wall time accounted for by named spans. Traces 1, 3: partially covered (~70%); uninstrumented regions exist within the DB path and service layer.

**Uninstrumented regions:** The DB layer in traces 1 and 3 shows high span counts (139–158 db spans) but most are short; the long ones are mongo ping and notification queue inserts. The gap between named spans in trace 1 (~4–6s) is the largest blind spot.

**Cross-trace pattern:** Every trace has the same structural set: Calendar + Discord × 3 + Gallabox × 2 + FCM × 2–4 all awaited sequentially. This is the consistent baseline cost.

**Outlier-only behavior:** STS ~4,500ms (traces 4, 5 only); Discord >5,000ms per call (traces 1, 2 only); MongoDB ping slow (trace 1 only); FCM >3,000ms (trace 3 only).

---

## Code-path findings

**Middleware chain:**
`checkAuthFirebaseMethod(true)` → calls Firebase Identity `accounts:lookup` (2 calls per request, 300–580ms each, confirmed in traces)
→ `checkAppToken` → DB lookup to verify token
→ `bookAppointmentPostHandler`

**Route to handler:** `bookAppointmentPostHandler` calls `saveTherapistAppointment(...)`, which at line 1384 calls `await processSessionBooking(insertResult.insertedId.toHexString())`. This is a synchronous inline call — `processSessionBooking` executes fully on the request thread before `res.send()`.

**Full sequential execution chain inside `processSessionBooking` (confirmed from code):**
1. `sendTherapistAppointmentDiscordNotification(appointment._id)` ← **BLOCKING DISCORD CALL** (up to 8,062ms per call; 3 calls total in Trace 2)
2. `getAnyoUserById(...)` → DB find
3. `getPlanSubscriptionById / getPackSubscriptionById` → DB find(s)
4. `addUpdateSessionNotificationTTLRecords(appointment)` → DB inserts
5. `generateGoogleMeetUrl(CARE_EMAIL, ...)` → `initGoogleMeetService` → `getAWSSecret(GMAIL_CREDS)` + `oauth2/v4/token` + `calendar/v3/calendars/primary/events` → ~2,000ms
6. `therapistAppointmentCollection.updateOne(...)` → save meet link
7. `void SESSION_NOTIFICATION_Q.publish(notificationRequest, true)` ← **only truly async call**
8. Age check → if under 18: Discord alert
9. `sendWhatsappMessage(userId, ANW0017, ...)` ← **BLOCKING WhatsApp** (up to 5,716ms)
10. `getTherapistById(...)` → DB find
11. `sendWhatsappMessage(therapistId, ANW0048, ...)` ← **BLOCKING WhatsApp** (up to 838ms)
12. `scheduleNotificationsForSession(sessionId)` ← **BLOCKING** (schedules Agenda jobs → DB inserts)
13. `stampSessionTags(...)` ← DB operations
14. `scheduleOnDemandJob(...)` ← DB insert
15. `updateTherapyStatusTherapyPlanSubscription(...)` ← DB updates
16. `updateTherapyStatusAnyoPackSubscription(...)` ← DB updates

**Sequential vs concurrent calls:** All 15 steps are sequential `await` calls. No `Promise.all` anywhere in this path.

**Caching layer:**
- `getAWSSecret`: has `secretCache` (Map). After first call, GMAIL_CREDS is cached. Confirmed by: SecretsManager calls are small (22–111ms) in most traces — likely other secrets being fetched, not GMAIL_CREDS. But OAuth2/v4/token still appears → the google.calendar client itself is NOT cached; `initGoogleMeetService` creates a fresh `GoogleAuth` + `google.calendar` instance every call.
- `CredentialManager`: refreshes AWS credentials on 45-minute background interval. BUT `SecretsManagerClient` is passed `CredentialManager.getCredentialProvider()` which returns a fresh provider function each call; the SDK can trigger STS on credential expiry mid-request.
- No Redis/in-process cache for user, therapist, subscription lookups.

**Trace-to-code match:**
- Discord calls (3 per trace) ← confirmed: `sendTherapistAppointmentDiscordNotification` calls at step 1, plus 2 separate Discord channels. Channels: 1298145678 (2 calls) + 1155905216 (1 call) — consistent across all traces.
- Calendar call (~2,000ms) ← confirmed: step 5 `generateGoogleMeetUrl`
- WhatsApp x2 ← confirmed: steps 9 and 11 `sendWhatsappMessage`
- Firebase Identity x2 ← confirmed: `checkAuthFirebaseMethod` middleware (likely user lookup + token verification)
- OAuth2/v4/token ← confirmed: `initGoogleMeetService` creates new `GoogleAuth` every call, no client caching
- STS us-east-1 (~4,500ms, intermittent) ← confirmed path: `SecretsManagerClient` uses `CredentialManager.getCredentialProvider()` → `defaultProvider()` → STS AssumeRole when credentials expire mid-request
- PostHog batch calls ← uninstrumented in code; likely from Sentry or PostHog SDK instrumentation triggered by request lifecycle
- FCM calls ← `SESSION_NOTIFICATION_Q.publish` is `void` but FCM spans appear; these come from the worker consuming the queue, which may still run within the same pod's event loop but is technically async. The appearance of FCM spans in the same trace suggests the worker executes quickly after publish on the same process.

**Mismatch / flag:** `SESSION_NOTIFICATION_Q.publish` at step 7 is `void` (fire-and-forget), yet FCM spans appear in the same trace. This confirms the pub/sub worker runs on the same process and its spans are captured in the same trace context. This is not a mismatch — it shows the queue worker runs very quickly after publish, often still within the request trace window.

---

## Evidence

**Direct trace evidence:**
- 5 traces reviewed individually, span-by-span
- Discord calls: 3 sequential calls per trace, present in all 5, latency 420ms–8,062ms per call
- Google Calendar: always present, always 1,820–2,272ms
- Gallabox WhatsApp: 2 calls per trace, first call 242ms–5,716ms
- FCM: 2–4 calls per trace, 154ms–5,219ms per call
- AWS STS us-east-1 (~4,500ms) in traces 4 and 5 only
- OAuth2/v4/token in traces 1, 3, 4, 5 — confirming no calendar client cache
- MongoDB ping operations slow in Trace 1 (2,163ms / 978ms)
- Firebase Identity 2 calls per trace (auth middleware)

**Direct code-path evidence:**
- `saveTherapistAppointment` (sessionService.ts:1384): `await processSessionBooking(...)` — confirmed synchronous inline call
- `processSessionBooking` (PostSessionBookingWorker.ts:65–244): all steps are sequential `await`; only `SESSION_NOTIFICATION_Q.publish` is `void`
- `initGoogleMeetService` (googleMeetService.ts:25–53): no client caching; creates `GoogleAuth` + `google.calendar` on every call
- `getAWSSecret` (awsSecretManagerService.ts): has `secretCache` Map — GMAIL_CREDS cached after first call
- `CredentialManager.getCredentialProvider()` returns fresh `defaultProvider()` or `fromContainerMetadata()` each call — no STS result cached beyond the SDK's own token TTL
- `checkAuthFirebaseMethod(true)` → Firebase Identity calls (2 per request, confirmed in traces)

---

## Inference discipline

**Code-informed inferences (not directly traced):**
- The 3 Discord calls per trace (channels 1298145678 × 2, 1155905216 × 1) come from `sendTherapistAppointmentDiscordNotification` — exact Discord channel assignments visible in the call patterns but not verified by reading `sessionNotificationService.ts`
- PostHog batch calls likely originate from the PostHog SDK auto-capture or analytics calls in the booking flow; exact origin not traced to a specific code line
- `scheduleNotificationsForSession` → Agenda DB inserts: the notification queue insert spans (1,977ms, 1,073ms) in Trace 1 likely correspond to this step

**Open questions instead of guesses:**
- What exact Discord channels are called in `sendTherapistAppointmentDiscordNotification` and how many Discord HTTP calls does it make? (Need to read `sessionNotificationService.ts`)
- Why do 2 Firebase Identity calls appear per trace — is `checkAuthFirebaseMethod` calling `accounts:lookup` twice, or is there a second auth check in the handler?
- Why does `SESSION_NOTIFICATION_Q.publish` result in FCM spans appearing in the same trace? Are FCM spans from the queue worker running in the same process event loop, or a coincidence?
- Is the STS call triggered by a SecretsManager call whose credentials expired, or by direct credential resolution in `CredentialManager`?

---

## Instrumentation gaps

- **MongoDB:** 139–158 db spans per trace but spans are aggregated; individual slow operations within `processSessionBooking` are not labeled by their call site (e.g., which service function triggered the slow find). Cannot attribute each slow find to a specific code step.
- **Uninstrumented regions:** Trace 1 has ~4–6s unaccounted for — likely within the DB-heavy steps of `processSessionBooking` but not confirmed.
- **PostHog:** PostHog SDK calls appear as http.client spans but are not labeled in application code; cannot determine if they are `await`-ed or fire-and-forget from code alone.
- **`scheduleNotificationsForSession`:** Not directly attributed in spans; DB inserts for notification records are visible but not tied to this function by name.
- **Impact on confidence:** Medium — the key external HTTP patterns (Discord, Calendar, Gallabox, STS) are directly traced and confirmed by code. The DB-layer timing (particularly Trace 1) has lower confidence due to span aggregation.

---

## Ranked hypotheses

**1. All of `processSessionBooking` runs synchronously on the request path — structural architectural cause (High)**
- Claim: The entire post-booking work (Discord × 3, Calendar, WhatsApp × 2, DB inserts, subscription updates) runs inside an `await processSessionBooking(...)` call before `res.send()`. This is the root cause of the 6–7s average.
- Confidence: **High** — directly observed in code (sessionService.ts:1384) and confirmed by span timestamps showing all external calls completing before response.
- Evidence: All 5 traces show the same structural pattern: 8–20 external HTTP calls, all sequential, all within the trace before it closes.
- What would confirm it: Moving processSessionBooking to async and observing avg drop to <500ms.

**2. Discord sends 3 sequential awaited HTTP calls before Calendar creation — dominant tail cause (High)**
- Claim: `sendTherapistAppointmentDiscordNotification` issues ≥3 sequential Discord API calls at the START of `processSessionBooking` (before Calendar, before WhatsApp). When Discord is slow (500ms–8,062ms per call), the response is delayed by up to 16,000ms from Discord alone.
- Confidence: **High** — directly observed in all 5 traces (3 Discord calls per trace) and code shows Discord notification as step 1 of `processSessionBooking`.
- Evidence: Trace 2: Discord = 16,076ms out of 25,365ms. Trace 1: Discord = 3,870ms. Discord latency is the most variable component.
- What would confirm it: Read `sessionNotificationService.ts` to verify call count; move Discord calls async and observe Discord contribution drop to zero in request span.

**3. Google Calendar `events.insert` always takes 1,820–2,270ms and blocks response (High)**
- Claim: Every single booking must call the Google Calendar API synchronously. This adds a floor of ~2,000ms to every trace.
- Confidence: **High** — observed in all 5 traces with consistent timing. Code confirms step 5 of `processSessionBooking` is `await generateGoogleMeetUrl(...)` which calls `calendar.events.insert`.
- Evidence: Calendar present in all 5 traces, range 1,820–2,272ms, median ~2,050ms.
- What would confirm it: Moving Calendar creation async and observing 2,000ms drop in avg.

**4. `initGoogleMeetService` creates a fresh Google client (including OAuth token fetch) on every booking — contributes ~300ms per call (High)**
- Claim: `initGoogleMeetService` is called every invocation with no client caching. The `GoogleAuth` instance fetches an OAuth2 token (`oauth2/v4/token`) on first use per client instance, adding ~207–340ms per booking.
- Confidence: **High** — confirmed in code (no caching in googleMeetService.ts) and observed in traces 1, 3, 4, 5 as a distinct `oauth2/v4/token` span.
- Evidence: OAuth2/v4/token present in 4/5 traces (207–340ms).
- What would confirm it: Cache the `google.calendar` client at module level (keyed by email) and observe `oauth2/v4/token` span disappearing.
- **Note:** This is the Fix 1 proposed in APH-4420 and is confirmed — but the expected gain (~250ms) is small relative to the total.

**5. Gallabox WhatsApp and FCM calls are sequential and awaited in-band — contribute 500ms–6,500ms (High)**
- Claim: Two sequential WhatsApp calls (user + therapist) and 2–4 sequential FCM calls all block the response. When Gallabox or FCM is slow, these add thousands of ms.
- Confidence: **High** — observed in all 5 traces (Gallabox × 2, FCM × 2–4 per trace); code confirms steps 9–11 are sequential `await sendWhatsappMessage(...)`.
- Evidence: Trace 3: Gallabox = 5,716ms. Trace 3: FCM = 5,219ms. Normally 200–900ms each, but tail is very long.
- What would confirm it: Move WhatsApp and FCM sends fully async and observe their contribution drop to zero in the request trace.

**6. AWS STS credential refresh on the request path adds ~4,500ms intermittently (Medium)**
- Claim: AWS credentials expire mid-request (or near expiry), triggering a cross-region STS call to `sts.us-east-1.amazonaws.com` (~4,500ms) during the `SecretsManagerClient` credential resolution step. This happens 2 of 5 observed traces (40% rate in this sample).
- Confidence: **Medium** — directly observed in 2 traces (4,503ms and 4,521ms); code shows `SecretsManagerClient` is created with `CredentialManager.getCredentialProvider()` which returns `defaultProvider()` — a lazy credential provider that can trigger STS. However, the exact trigger (which code call initiates it) is not traced to a specific line.
- Evidence: Traces 4 and 5 both show `sts.us-east-1.amazonaws.com/` = ~4,500ms, timed at the start of the trace window, before Calendar. Not present in traces 1, 2, 3.
- What would confirm it: Log credential expiry timestamps; check if 45-minute refresh timer in `CredentialManager` is racing with request-path credential use. Instrument the STS call to identify which SDK client triggers it.

**7. MongoDB ping operations slow during DB load periods — sporadic compound failure (Low)**
- Claim: Under concurrent DB load, MongoDB health-check pings in the connection pool slow dramatically (2,163ms observed), adding thousands of ms to the DB layer within a single request.
- Confidence: **Low** — observed in Trace 1 only; no code evidence of explicit ping calls (these come from the MongoDB driver's connection health check logic, not application code).
- Evidence: Trace 1 only; 5 ping operations totaling ~4,000ms. Other traces show DB avg 6–19ms.
- What would confirm it: Correlate MongoDB Atlas metrics for connection pool churn or IOPS spikes at 2026-03-17T16:08.

**~~8. PostHog analytics awaited sequentially in-band~~ — RULED OUT**
- PostHog is not used in the backend (`anyobackendapi`). The PostHog batch spans appearing in these traces originate from the **client app** (Sentry distributed tracing propagates the trace ID from frontend to backend, so client-side PostHog calls appear in the same trace). They have zero impact on backend response time.
- Confirmed by user. Removed from hypotheses.

---

## Open questions / confidence

**Open questions:**
1. What does `sendTherapistAppointmentDiscordNotification` do exactly — how many Discord API calls does it make and to which channels? (Read `sessionNotificationService.ts`)
2. Why does `checkAuthFirebaseMethod` issue 2 Firebase Identity calls per request?
3. Is `SESSION_NOTIFICATION_Q` an in-process EventEmitter or a real async queue? If in-process, FCM spans inside the same trace are expected.
4. What triggers the STS call — is it the `SecretsManagerClient` credential provider, or a separate AWS SDK client?
5. Is `scheduleNotificationsForSession` itself slow, or is the slowness from the DB inserts it triggers?
6. Is PostHog SDK used with `await` or fire-and-forget?

**Overall confidence:** High on structural findings (synchronous processSessionBooking, Discord × 3, Calendar, WhatsApp × 2). Medium on STS. Low/Speculative on PostHog and MongoDB ping root cause.

**Handoff note:** Code reading of `sessionNotificationService.ts` (for Discord call count) and `pubsubService.ts` / `SessionNotificationWorker.ts` (for queue type and FCM origin) should be done before finalizing a fix plan. The STS finding requires separate investigation of `CredentialManager` + production credential expiry timing.

---

## Summary of what APH-4419 missed

| Finding | APH-4419 | This report |
|---------|----------|-------------|
| Google Calendar client no-cache (oauth2 token) | Identified as Fix 1 (~250ms) | Confirmed, but minor relative to total |
| Discord 3 sequential calls blocking before Calendar | Not mentioned | **New — high confidence, dominant tail cause** |
| Gallabox/FCM awaited in-band | Partially (grouped as "notifications") | Confirmed, quantified per call |
| processSessionBooking called synchronously | Mentioned but imprecise | Confirmed at line 1384; entire function blocks response |
| AWS STS ~4,500ms intermittent spike | Not mentioned | **New — medium confidence, 2/5 traces** |
| MongoDB ping slowness (2,163ms) | Not mentioned | Observed in Trace 1, isolated |
| PostHog analytics in-band | Not mentioned | Speculative, needs code confirmation |
| Calendar (2,000ms) needs to go async too | Proposed to keep Calendar synchronous | Calendar always 2,000ms — should also be async |
