# Startup Probe Analysis - 2026-03-18

## Scope

- Workload: `anyo-api`
- Cluster: `anyo-gke-autopilot-as1`
- Namespace: `anyo-backend`
- Signal used: `startup_complete` log emitted from `src/server.ts`

## Source Signal

The API logs startup completion through:

```ts
logger.infoMeta("startup_complete", {
  event: "startup_complete",
  duration_ms: startupDurationMs,
  server_type: "express",
});
```

This measures app startup until Express reaches the `listening` callback.

## Historical Measurements

Read-only query window: last 14 days

- sample count: `500`
- min: `28.6s`
- mean: `41.8s`
- p50: `40.6s`
- p90: `49.0s`
- p95: `53.4s`
- p99: `62.0s`
- max: `83.4s`

Bucket summary:

- `<= 40s`: `219 / 500`
- `<= 50s`: `456 / 500`
- `<= 60s`: `491 / 500`
- `> 60s`: `9 / 500`
- `> 70s`: `1 / 500`

Slowest observed startups in the 14-day sample:

- `83.4s` on `2026-03-12T10:45:54Z`
- `67.1s` on `2026-03-09T06:27:57Z`
- `65.9s` on `2026-03-09T06:27:55Z`
- `64.1s` on `2026-03-09T05:55:21Z`
- `62.2s` on `2026-03-09T06:27:51Z`

## Current Probe Config

From `infra/gcp/k8s/base/api/deployment.yaml`:

```yaml
startupProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 60
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 30
```

Interpretation:

- first startup probe begins only after `60s`
- probe retries happen every `10s`
- a pod is restarted only after `30` failed probes
- total startup allowance is roughly `60 + (30 * 10) = 360s`

## Decision

Do not increase `failureThreshold`.

Reason:

- observed max startup (`83.4s`) is far below the current `~360s` startup budget
- increasing `failureThreshold` would mainly delay restart of genuinely stuck pods
- the useful optimization is earlier probing, not more retry budget

Approved post-event probe target:

- keep `periodSeconds: 10`
- keep `timeoutSeconds: 5`
- keep `failureThreshold: 30`
- change `initialDelaySeconds` from `60` to `30`

## Why `30s`

- current `60s` delay is safe but slow; most pods are already listening before the first probe
- `30s` gives earlier readiness checks without materially reducing startup safety
- slow pods still retain a very large retry window after probing begins

Expected effect:

- normal pods can become ready roughly `10-20s` earlier during scale-up
- startup safety remains high because retry budget is still much larger than observed startup times

## Relationship To HPA Retune

This probe decision complements the approved post-event HPA change:

- `minReplicas: 2`
- `maxReplicas: 50`
- CPU target switches from `AverageValue: 525m` to `Utilization: 60`

The HPA change makes scale-out start earlier, and the startupProbe change helps new pods become useful sooner once they launch.
