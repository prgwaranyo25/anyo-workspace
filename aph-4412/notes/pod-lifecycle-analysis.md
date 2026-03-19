# Pod Lifecycle Analysis - anyo-api (Last 7 Days)

**Date:** 2026-03-19
**Data window:** 2026-03-16 18:00 UTC to 2026-03-19 07:46 UTC (~2.6 days visible from 500-event limit)
**Source:** Cloud Logging, project anyo-infra, cluster anyo-gke-autopilot-as1, namespace anyo-backend

---

## Summary of Findings

| Metric | Value |
|--------|-------|
| Total lifecycle events captured | 500 (limit hit) |
| Pod creations (SuccessfulCreate) | 184 |
| Pod deletions (SuccessfulDelete) | 145 |
| ScalingReplicaSet events | 171 |
| HPA scale-ups (anyo-api) | 81 |
| HPA scale-downs (anyo-api) | 90 |
| Direction reversals within 5 min | 60 |
| Direction reversals within 10 min | 76 |
| Max replica count observed | 15 |
| Min replica count observed | 0 |
| Readiness probe failures | **0** |
| Distinct ReplicaSets (deployments) | 6 |
| Deployment rollouts in window | 3 |

---

## Q1: Pod Create/Delete Cycles

In the ~2.6-day visible window, **184 pods were created** and **145 were deleted**. The 500-event cap means the actual 7-day totals are higher. Extrapolating linearly: ~500 creates and ~400 deletes over 7 days.

---

## Q2: Average Pod Lifetime

For 116 pods where both creation and deletion were observed:

| Metric | Value |
|--------|-------|
| Average lifetime | 2h 32m |
| Median lifetime | 17m 6s |
| Min lifetime | **1 second** |
| Max lifetime | 14h 13m |

The dramatic gap between average (2.5h) and median (17min) reveals a bimodal distribution: many pods live very briefly while some survive for hours.

### Lifetime Distribution

| Bucket | Count |
|--------|-------|
| < 2 min | 10 |
| 2-5 min | 9 |
| 5-15 min | 35 |
| 15-30 min | 12 |
| 30-60 min | 17 |
| 1-4 hr | 5 |
| 4-12 hr | 15 |
| 12-24 hr | 13 |
| > 24 hr | 0 |

**57% of pods (66/116) are killed within 30 minutes of creation.** The largest bucket is 5-15 minutes (35 pods), indicating the HPA is consistently creating pods that survive just one or two HPA evaluation cycles before being deemed excess.

---

## Q3: Rapid Create-Then-Delete Patterns

**19 pods were killed within 5 minutes of creation.** Notable examples:
- `anyo-api-6dd66cc974-5mqmr`: lived 1 second
- `anyo-api-79c8b449c5-x8qf5`: lived 4 seconds
- 5 pods from RS `79c8b449c5`: lived 14-15 seconds each

The 1-second and 4-second lifetimes strongly suggest these pods were created during a rolling deployment and immediately terminated as the old ReplicaSet was being drained.

The 14-15 second cluster from `79c8b449c5` likely represents a new RS that was itself superseded by yet another deployment before pods could start.

---

## Q4: Readiness Probe Failures

**Zero readiness probe failure events** were found in the last 7 days. The query returned an empty result set. This means:
- Pods are not failing readiness checks
- The scaling instability is NOT caused by unhealthy pods being killed
- Pods become ready successfully but are then removed by HPA scale-down decisions

---

## Q5: Newly Scaled Pods Failing Readiness Checks?

**No.** There is no evidence of readiness check failures. The lifecycle pattern is:
1. HPA scales up (load spike)
2. New pods start and pass readiness checks successfully
3. Load drops (or averages stabilize after the cooldown window)
4. HPA scales down, killing the recently-created pods

This is a classic **HPA thrashing** pattern, not a health-check failure pattern.

---

## Q6: Creation to Readiness Time

Cannot be directly derived from the available events. The 500-event window contains only ScalingReplicaSet, SuccessfulCreate, and SuccessfulDelete events. No Started, Pulled, or Ready condition events appear. However, the absence of any Unhealthy/BackOff events indicates readiness is being achieved normally.

---

## Deeper Analysis: Two Distinct Instability Patterns

### Pattern 1: HPA Oscillation (2->3->2 bouncing)

Clearly visible on 2026-03-17 (before any deployments in the window):
- RS `anyo-api-844bd4d8c5` oscillated between 2 and 3 replicas **repeatedly**
- Typical cycle: scale 2->3, wait 5-30min, scale 3->2, wait 5-30min, repeat
- This happened ~20 times in a single day
- Occasionally spiked to 4 before dropping back to 2

**Root cause:** The HPA target threshold sits right at the boundary between 2 and 3 replicas for normal traffic. Slight load variations trigger constant toggling.

### Pattern 2: Deployment Rollover Storms

Three deployment rollouts occurred in the 2.6-day window:
- 2026-03-18 08:23 UTC: RS `7f6d559465` (0->1, then ramped to 15)
- 2026-03-18 14:27 UTC: RS `547dc4ff7b` (0->1, then ramped to 15)
- 2026-03-19 04:36 UTC: RS `6dd66cc974` (0->1, then ramped to 7)

During each rollout:
- The new RS scales up 1 pod at a time (~1 min apart)
- The old RS scales down 1 pod at a time in lockstep
- Total desired replicas stay at ~15-16 during the transition
- After rollout completes, HPA immediately starts scaling down aggressively (15->2 in one jump)

The 15->2 instant scale-down after deployment suggests the HPA's metrics reset or recompute after the new RS stabilizes, finding the actual load requires far fewer pods.

### Pattern 3: Post-Deployment Oscillation

After the 2026-03-19 04:36 rollout to RS `6dd66cc974`:
- Scaled down from deployment size to 2-3 replicas
- Then entered rapid 2->3->2 oscillation every 2-3 minutes for over an hour
- This is more aggressive oscillation than the pre-deployment Pattern 1

---

## Hourly Activity Distribution (IST)

| Time (IST) | Events | Pattern |
|-------------|--------|---------|
| 09:00-13:00 | 322 | Heavy - business hours scaling + deployments |
| 19:00-20:00 | 116 | Heavy - evening deployment rollout |
| 14:00-18:00 | 35 | Moderate |
| 05:00 | 9 | Light |
| 21:00-08:00 | 18 | Minimal |

---

## Key Conclusions

1. **HPA is chronically oscillating** between 2 and 3 replicas during normal operation. This is the most frequent pattern and indicates the HPA target utilization threshold creates a boundary that normal traffic constantly crosses.

2. **Frequent deployments amplify instability.** 3 deployments in 2.6 days, each causing a full rolling replacement of all pods. During rollouts, replica counts temporarily spike to 15, then crash back down.

3. **Pods are healthy.** Zero readiness failures. The problem is purely HPA decision-making, not pod health.

4. **57% of pods live less than 30 minutes.** This is extremely wasteful on GKE Autopilot where you pay per pod-second and node provisioning/deprovisioning adds latency.

5. **76 direction reversals in 10-minute windows** across 2.6 days confirms severe HPA thrashing.

## Recommendations

1. **Increase HPA stabilization window** (`behavior.scaleDown.stabilizationWindowSeconds`) to at least 300s (5 min), ideally 600s
2. **Add scale-down rate limiting** (`behavior.scaleDown.policies`) to prevent dropping more than 1 pod per 60 seconds
3. **Increase minReplicas to 3** to eliminate the constant 2<->3 oscillation
4. **Consider setting `scaleDown.selectPolicy: Disabled`** during peak hours if deployments are frequent
5. **Review deployment frequency** - 3 deployments in 2.6 days is high; each causes significant pod churn
