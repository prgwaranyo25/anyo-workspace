---
name: anyobackendapi-api-latency-diagnosis
description: Use when a slow anyobackendapi endpoint or API route shows p95 or p99 tail latency, route regression, timeout spike, Sentry performance issues, trace investigation needs, or suspicious span waterfall behavior.
---

# anyobackendapi API latency diagnosis

Use this skill for diagnosis only. Keep the investigation evidence-first and avoid shallow conclusions from one worst trace, mixed evidence and inference, skipped code-path review, thin instrumentation, or early fix ideation.

## Required guardrails

- Load the active ticket context first, and load parent epic context too when the ticket sits under an epic.
- Confirm the exact route scope first: method, path or route pattern, environment, time window, and whether the complaint is tail latency, average latency, timeout rate, or a single outlier report.
- Capture the same route metrics set for both `24h` and `7d` before interpreting traces: request count, avg, p95, and p99.
- Inspect multiple useful slow traces; do not let one dramatic trace define the route story.
- Inside every trace: record total duration, which spans consume >10% of wall time, gaps between spans (time not covered by any named span), whether expensive calls are sequential or concurrent, and any span that repeats more than once.
- Review span patterns across traces, not just the slowest span in the worst trace.
- For every span family: estimate its rough share of wall time (ms and %). Flag when the sum of all named spans is materially less than total trace duration — that gap is uninstrumented work and must be stated explicitly.
- Inspect the code path from route handler through middleware, services, queries, and downstream HTTP dependencies before stating conclusions.
- In the code path: confirm the full middleware chain the request passes through, identify every DB query or external HTTP call the handler triggers, determine whether those calls are sequential or concurrent, and check whether any caching layer is present or bypassed.
- Make missing instrumentation explicit; low visibility lowers confidence.
- Keep direct observations, code-informed inferences, and hypotheses visibly separate.
- Stop at ranked hypotheses only.

## Do not do this

- Do not recommend fixes, optimizations, caching, indexing, batching, retries, or refactors.
- Do not write a fix plan, remediation checklist, or next-step implementation plan inside this skill output.
- Do not present one trace as representative unless repeated trace evidence supports it.
- Do not hide evidence gaps with confident guesses.

## Workflow

1. Load ticket context.
   - Load the active ticket before diagnosing the route.
   - If the ticket belongs to an epic, load the parent epic context too.
2. Confirm route scope.
   - Record method, route, environment, time window, and why this route is considered slow.
   - Classify the symptom: persistent tail (p95/p99 consistently elevated), bursty spike (intermittent surges), or avg-driven slowness (broad degradation).
   - Note whether the scope is one handler, one endpoint family, or one reported request shape.
3. Capture route metrics.
   - Query Sentry using `span.op:http.server` with `environment:production` for the exact transaction name matching this route.
   - Record the same required route metrics shape for both `24h` and `7d` windows: request count, avg, p95, p99.
   - Compare the two windows: note whether the tail is stable, worsening, or only appearing in one window.
4. Inspect multiple slow traces.
   - Review at least three slow traces from the route tail (p95+); if fewer are available or usable, state exactly why.
   - For each trace record:
     - Total duration.
     - Every span that consumes >10% of wall time: name, duration, % of total.
     - Time gaps between spans (untraced wall time): total gap duration and % of total.
     - Whether any span type repeats more than once (possible N+1 or loop).
     - Whether the dominant expensive calls are sequential or parallel.
   - After reviewing all traces: record what repeats across traces versus what appears only once.
   - If traces are thin or sparse, say so and reduce confidence accordingly.
5. Review span patterns.
   - For each span family present (`db`, `http.client`, middleware/auth, serialization, cache, CPU/event-loop), record its typical duration range and rough % of wall time across traces.
   - Compute whether the sum of named spans accounts for the full trace duration. If the gap is >15% of total duration, flag it as an uninstrumented region and treat it as a blind spot.
   - Note whether span families co-occur, alternate by trace, or appear only in certain outliers.
6. Inspect code path.
   - Walk from route definition → Express middleware chain → handler → service layer → DB/cache/external HTTP in `anyobackendapi`.
   - For each layer confirm: what work happens, what calls are made, whether calls are sequential or concurrent, and whether any caching is in place.
   - Check whether the traced latency buckets match real code-path dependencies. If a slow span has no corresponding code-path explanation, flag the mismatch explicitly.
   - Separate directly observed evidence (seen in traces or code) from code-informed inference (plausible from code but not traced).
   - If something is not directly observed in traces or code, keep it out of findings and list it as an open question.
7. End at ranked hypotheses.
   - Rank the most likely route latency explanations using the confidence definitions below.
   - For each hypothesis state: what it claims, confidence level, the specific evidence supporting it, and what would need to be true to confirm it.
   - Add at most a minimal handoff note for a separate follow-up step outside this skill.
   - Stop there.

## Confidence definitions

Use exactly these labels. Do not invent others.

- **High** — directly observed in multiple traces and confirmed by code-path inspection. No alternative explanation fits the same evidence.
- **Medium** — observed in traces but code-path inspection is incomplete, or observed in code but not clearly traced. One alternative explanation is plausible.
- **Low** — inferred from partial trace evidence or code structure alone. Multiple alternative explanations remain open.
- **Speculative** — no direct trace or code evidence; included only because instrumentation gaps prevent ruling it out.

## Output template

```markdown
## Route and scope
- Method / route:
- Environment:
- Time window:
- Reported symptom:
- Symptom classification: (persistent tail / bursty spike / avg-driven)
- Scope notes:

## Metrics
- 24h count / avg / p95 / p99:
- 7d count / avg / p95 / p99:
- Window comparison: (stable / worsening / 24h-only / 7d-only)
- Persistence / shape:

## Trace observations
- Trace count reviewed:
- Trace 1 — total duration:
  - Spans >10% wall time:
  - Untraced gap (ms / %):
  - Repeated span types:
  - Call sequencing (sequential / concurrent / mixed):
- Trace 2 — total duration:
  - Spans >10% wall time:
  - Untraced gap (ms / %):
  - Repeated span types:
  - Call sequencing:
- Trace 3 — total duration:
  - Spans >10% wall time:
  - Untraced gap (ms / %):
  - Repeated span types:
  - Call sequencing:
- Repeated vs isolated findings:

## Span patterns
- Span family breakdown (name / typical range / avg % of wall time):
- Named span coverage vs total duration: (sum of named spans vs trace total; flag if gap >15%)
- Uninstrumented regions:
- Cross-trace pattern:
- Outlier-only behavior:

## Code-path findings
- Middleware chain:
- Route to handler:
- Services / queries / downstream calls:
- Sequential vs concurrent calls:
- Caching layer (present / absent / bypassed):
- Trace-to-code match: (where traced spans align with code; flag any mismatches)

## Evidence
- Direct trace evidence:
- Direct code-path evidence:

## Inference discipline
- Code-informed inferences:
- Open questions instead of guesses:

## Instrumentation gaps
- Missing spans or weak visibility:
- Uninstrumented regions and their estimated size:
- Impact on confidence:

## Ranked hypotheses
1. Hypothesis — confidence (High/Medium/Low/Speculative) — supporting evidence — what would confirm it
2. Hypothesis — confidence — supporting evidence — what would confirm it
3. Hypothesis — confidence — supporting evidence — what would confirm it

## Open questions / confidence
- Open questions:
- Overall confidence:
- Handoff note for separate follow-up step (optional):
```
