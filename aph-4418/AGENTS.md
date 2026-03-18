# APH-4418 Route Investigation Rules

This epic is for production-safe API latency reduction in `anyobackendapi`.

## Preferred Route Workflow

- Use the `anyobackendapi-api-latency-diagnosis` skill as the default route-diagnosis workflow for every child ticket.
- Keep route-specific evidence and diagnosis inside the child ticket folder.

## Epic-Local Constraints

- Phase 1 covers app APIs only.
- Work from `anyobackendapi/src/server.ts` outward.
- One route per child ticket.
- No bulk fixes across multiple routes.
- No repo code changes until the target route ticket context is loaded.
- Keep all shared observations, patterns, prioritization, and production-safety notes in `aph-4418/`.

## Epic Observation Policy

- Put shared patterns, repeated bottlenecks, and cross-route notes in `aph-4418/state.yml` or `aph-4418/notes/`.
- Put route-specific evidence in the child ticket folder only.
- If instrumentation is missing, record that explicitly instead of guessing.

Optimize for safety, evidence depth.
