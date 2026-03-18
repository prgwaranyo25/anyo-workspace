# anyobackendapi API Latency Diagnosis Skill Design

Date: 2026-03-18

## Goal

Create one repo-specific skill that standardizes how we diagnose slow `anyobackendapi` HTTP routes before any fix is proposed.

The skill should make route investigations consistent across child tickets in `APH-4418` and later latency work.

## Why This Skill Exists

Current route investigation quality can drift if a session:

- relies on one sampled slow trace
- stops at top-level p95 numbers
- skips code-path inspection
- jumps too quickly into fix ideas

For production-facing APIs, we want the same deep diagnostic output every time.

## Scope

- Anyo-specific
- `anyobackendapi` only
- HTTP route latency diagnosis only
- Primary evidence source: Sentry
- Optional follow-up: repo inspection and infra checks only when the evidence points there

## Non-Goals

- Not a generic latency skill for all repos
- Not a fix-planning skill
- Not an implementation skill
- Not a performance-optimization cookbook

The skill stops at diagnosis and ranked hypotheses.

## Proposed Skill Shape

- Location: `.opencode/skills/anyobackendapi-api-latency-diagnosis/SKILL.md`
- Type: repo-specific diagnostic skill
- Primary trigger: when investigating why a specific `anyobackendapi` route is slow

## Trigger Conditions

Use the skill when:

- a child ticket targets one backend route
- the task is to explain route latency from evidence
- Sentry has p95/p99 concerns for one route
- we need route-level traces, spans, and dependency analysis
- the route is production-facing and needs a careful diagnosis before any fix discussion

## Required Workflow

The skill should require this sequence:

1. Load ticket and parent context first.
2. Confirm route identity and transaction name.
3. Pull `24h` and `7d` route metrics from Sentry.
4. Record count, avg, p95, and p99.
5. Inspect multiple slow traces, not just the worst one.
6. Compare traces for recurring span patterns.
7. Note dominant spans and missing instrumentation.
8. Inspect code path from route to handler, service, DB/cache/external dependencies.
9. Compare whether latency is broad or driven by outliers.
10. Produce ranked hypotheses and open questions.

## Hard Guardrails

The skill should explicitly forbid:

- treating one sampled slow trace as enough
- proposing fixes inside the skill output
- skipping code-path inspection when traces are thin
- guessing root cause when instrumentation is missing
- batching multiple routes into one investigation

## Expected Output

Every invocation should end with the same structure:

- route and scope
- 24h and 7d count / avg / p95 / p99
- recent vs stable trend notes
- multiple trace observations
- dominant spans / downstream dependencies
- code-path findings
- instrumentation gaps
- ranked hypotheses
- investigation confidence and open questions
- handoff note for a separate fix-brainstorming step

## Relationship To APH-4418

- `APH-4418` remains the epic-level source of shared observations
- child tickets remain route-specific
- this skill replaces ad hoc route-diagnosis behavior with a repeatable workflow
- fix brainstorming remains outside the skill

## Skill Quality Strategy

Because this is a real skill, it should be verified with `writing-skills` discipline:

1. Run a baseline route-investigation scenario without the skill.
2. Capture shallow behavior or rationalizations.
3. Write the skill to close those gaps.
4. Re-run the scenario with the skill.
5. Confirm the output is deeper and standardized.

## Initial Proving Ground

Use `APH-4419` for `POST /app/bookAppointment` as the first pressure scenario.

That route is a good test because it already has:

- meaningful user impact
- poor p95/p99
- evidence of DB and `http.client` activity
- enough complexity to expose shallow investigation habits
