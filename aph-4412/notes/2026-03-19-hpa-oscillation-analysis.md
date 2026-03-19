# APH-4412: HPA Oscillation Analysis — anyo-api (7-day window)

**Date:** 2026-03-19
**Cluster:** anyo-gke-autopilot-as1 (asia-south1)
**Namespace:** anyo-backend
**Workload:** anyo-api
**HPA:** anyo-api-hpa — CPU AverageValue target: 525m, minReplicas: 2, maxReplicas: 50

---

## Executive Summary

**Confirmed: anyo-api HPA is thrashing.** The workload exhibits classic threshold-flapping behavior where CPU hovers right at the HPA decision boundary, causing continuous scale-up/scale-down cycles. Over 7 days:

- **137 HPA scaling events** (66 up / 71 down — near 1:1 ratio)
- **68 complete A→B→A oscillation cycles**, 39 completing within 60 minutes
- **57% of newly created pods killed within 30 minutes** of creation
- **Median pod lifetime: 17 minutes**
- **Zero readiness probe failures** — pods are healthy; HPA is killing them

The problem is **purely HPA tuning**, not pod health or application instability.

---

## 1. Scaling Event Analysis

### 1.1 Event Volume & Direction

| Direction | Count | % |
|-----------|-------|---|
| Scale-up  | 66    | 48.2% |
| Scale-down| 71    | 51.8% |

A healthy HPA should have far more stable periods than transitions. The near-equal up/down split means the HPA rarely reaches equilibrium.

### 1.2 Inter-Event Timing

| Gap | Events | % |
|-----|--------|---|
| < 5 min | 48 | 35% |
| 5–15 min | 48 | 35% |
| 15–30 min | 14 | 10% |
| 30–60 min | 9 | 7% |
| > 1 hour | 17 | 12% |

**70% of all scaling decisions happen within 15 minutes of the previous one.** Median inter-event gap is 5.8 minutes.

### 1.3 Dominant Replica Transitions

| Transition | Count | Notes |
|------------|-------|-------|
| 3 → 2 | 36 | Scale-down |
| 2 → 3 | 32 | Scale-up |
| 4 → 3 | 8 | |
| 3 → 4 | 6 | |

The **2↔3 ping-pong accounts for 50% of all events**. The workload's natural CPU load sits right at the boundary between needing 2 and 3 replicas.

### 1.4 Oscillation Cycles

- **68 A→B→A cycles** detected
- **39 complete within 60 minutes**
- Dominant patterns: `3→2→3` (31 times), `2→3→2` (29 times)

Example from March 17 (6 full cycles in 3 hours):
```
04:46  3→2→3  (37 min)
05:22  3→4→3  (17 min)
05:39  3→2→3  (20 min)
06:56  2→3→2  (22 min)
07:13  3→2→3  (10 min)
07:18  2→3→2  (12 min)
```

---

## 2. CPU Utilization Correlation

### 2.1 CPU Request Utilization Statistics

| Stat | Per-Pod | Per-Window Avg (HPA's view) |
|------|---------|---------------------------|
| Mean | 22.4%  | 27.4% |
| P50  | 14.0%  | 19.2% |
| P90  | 50.2%  | 56.3% |
| P95  | 69.0%  | 73.9% |

The workload idles at ~14–19% but spikes to 50–70%+ at P90/P95. This extreme variance is the oscillation driver.

### 2.2 HPA Trigger Correlation

The HPA uses `AverageValue: 525m` (absolute CPU). Context:
- Pod CPU request: 300m (Autopilot-adjusted to 385m)
- The 525m target was only breached in **1 out of 2016 monitoring windows** (0.05%)
- But request utilization crosses 30% **400 times** and 50% **240 times** in 7 days

The transient CPU spikes are brief enough to trigger HPA evaluation cycles but not sustained enough to justify the extra capacity.

### 2.3 Post-Scale-Up CPU Drop — The Core Problem

When HPA scales from 2→3 replicas, CPU drops almost immediately:
```
T+0:   528m avg across 2 pods  (trigger)
T+5:   325m avg across 3 pods  (38% drop)
T+10:  228m avg across 3 pods  (57% drop from peak)
```

**The burst ends before the new pod even finishes starting.** Every scale-up creates an immediately over-provisioned state that guarantees a subsequent scale-down.

---

## 3. Replica Count Time Series

### 3.1 Replica Distribution

| Replicas | % of Time |
|----------|-----------|
| 2 | 82.0% |
| 3 | 4.8% |
| 4 | 0.7% |
| 5–11 | 0.4% |
| 15 | 12.1% |

The workload is bimodal: almost always at 2 replicas, with brief excursions to 3 and one anomalous spike to 15 (Mar 18 event).

### 3.2 Stability Periods

- **Median stability duration: 9 minutes** (extremely short)
- **Average: 108 minutes** (skewed by overnight periods at 2)
- Pattern: long stable overnight at 2, punctuated by 5–8 min excursions to 3 during business hours

### 3.3 Scale-Down Stabilization Window Behavior

Most scale-downs happen **exactly 5 minutes** after the preceding scale-up — matching the default `scaleDown.stabilizationWindowSeconds: 300`. The stabilization window is working but is too short to prevent the oscillation cycle.

### 3.4 Two Behavioral Regimes

**Regime A (Normal, Mar 12–17):** Baseline 2 replicas, brief spikes to 3 (rarely 4). Classic threshold flapping. Mar 17 was worst: 37 transitions in one day.

**Regime B (Anomaly, Mar 18 08:23–Mar 19 04:36):** Massive spike 2→8→15 in 2 minutes. Held at 15 for 20 hours, then cascaded down over ~2 hours through 11→7→6→5→4→3→2.

### 3.5 Hourly Distribution (IST)

Peak scaling: **10:00–13:00 IST** (63% of events). Secondary peak at **20:00 IST**. Matches business-hours traffic patterns.

---

## 4. Pod Lifecycle Impact

### 4.1 Pod Churn

- **184 pod creations** / **145 pod deletions** in 2.6 days (extrapolated: ~500/~400 per week)
- **6 distinct ReplicaSets** observed (3 deployments in 2.6 days compound the problem)

### 4.2 Pod Lifetime Distribution

| Lifetime | Pods | % |
|----------|------|---|
| < 5 min | 19 | 16% |
| 5–15 min | 35 | 30% |
| 15–30 min | 12 | 10% |
| 30 min–1 hr | 8 | 7% |
| > 1 hr | 42 | 36% |

**57% of pods are killed within 30 minutes.** One pod lasted just 1 second. Average lifetime 2h 32m but **median only 17 minutes**.

### 4.3 Readiness Probe Failures

**Zero.** No readiness probe failures in the entire 7-day window. Pods start healthy and serve traffic correctly — HPA kills them because the metric drops after scaling.

### 4.4 Wasted Compute

Every short-lived pod wastes ~40–60 seconds of startup time (p50 startup_complete = 40.6s) plus Autopilot node provisioning. With 57% of pods dying within 30 minutes, a significant fraction of compute spend is going to pods that never serve meaningful traffic.

---

## 5. Root Cause Synthesis

### The Feedback Loop

```
Traffic burst → CPU spikes above HPA threshold
  → HPA scales 2→3
    → Load distributes across 3 pods + burst ends
      → Per-pod CPU crashes below threshold
        → After 5-min stabilization, HPA scales 3→2
          → Next burst arrives → cycle repeats
```

### Contributing Factors

| Factor | Impact | Evidence |
|--------|--------|----------|
| **CPU AverageValue threshold at 2/3 boundary** | PRIMARY | 50% of events are 2↔3 transitions |
| **Transient burst pattern** | PRIMARY | Bursts end within 5 min; post-scale CPU drops 57% in 10 min |
| **scaleDown stabilization too short (300s)** | SECONDARY | Scale-downs happen exactly at 5 min; insufficient cooldown |
| **No scaleDown rate-limiting policy** | SECONDARY | 17 transitions occur with <5 min gaps |
| **Frequent deployments (3 in 2.6 days)** | CONTRIBUTING | Each deployment resets replicas, triggering fresh oscillation |
| **Pod health** | NOT A FACTOR | Zero readiness failures in 7 days |

---

## 6. Recommendations

### Immediate (break the oscillation)

1. **Set `minReplicas: 3`** — The workload needs 3 replicas during any active traffic period. This eliminates the 2↔3 ping-pong entirely and wastes minimal resources (1 extra pod at ~385m CPU).

2. **Increase `behavior.scaleDown.stabilizationWindowSeconds` to 600s** — Double the cooldown before scale-down to let transient bursts settle fully.

### Post-Event (tune scaling behavior)

3. **Add scaleDown rate-limiting policy:**
   ```yaml
   behavior:
     scaleDown:
       stabilizationWindowSeconds: 600
       policies:
         - type: Percent
           value: 25
           periodSeconds: 300
       selectPolicy: Min
   ```
   This limits scale-down to at most 25% of replicas per 5-minute period.

4. **Add scaleUp stabilization window (60–120s)** to prevent reacting to single-sample CPU spikes.

5. **Evaluate switching to `AverageUtilization: 70`** (per DRI-016 constraints — requires production validation first) to make scaling less sensitive to absolute CPU values that shift with Autopilot request adjustments.

---

## Data Artifacts

| File | Contents |
|------|----------|
| `hpa-scaling-events.json` | 137 SuccessfulRescale events |
| `cpu-utilization-7d.json` | Container CPU core_usage_time (245 series) |
| `cpu-request-utilization-7d.json` | Container CPU request_utilization (244 series) |
| `hpa-desired-replicas-7d.json` | HPA desired replicas (1-min resolution) |
| `hpa-current-replicas-7d.json` | HPA current replicas (1-min resolution) |
| `pod-lifecycle-events-7d.json` | 500 pod lifecycle events |
| `readiness-failures-7d.json` | Readiness probe failures (empty — zero failures) |
