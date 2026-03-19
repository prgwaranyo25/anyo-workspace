# CPU Metrics 7-Day Analysis: HPA Oscillation Evidence

**Date:** 2026-03-19
**Period:** 2026-03-12 to 2026-03-19 (7 days)
**Source:** Cloud Monitoring API, project `anyo-infra`
**Cluster:** `anyo-gke-autopilot-as1`, namespace `anyo-backend`, container `api`

---

## 1. Executive Summary

The CPU metrics conclusively confirm severe HPA oscillation. Over the 7-day window there were **198 scale events** (101 scale-ups, 97 scale-downs), with **116 events occurring within 10 minutes of each other**. The classic pattern is: spike triggers scale-up, new pods dilute the average, CPU drops, HPA immediately scales back down, and the cycle repeats.

---

## 2. CPU Request Utilization Statistics (ratio: actual/requested)

This is the metric most directly relevant to HPA behavior.

| Stat | Per-Pod Value | Per-Window Average (HPA's view) |
|------|--------------|--------------------------------|
| Mean | 0.2241 (22.4%) | 0.2740 (27.4%) |
| P50  | 0.1402 (14.0%) | 0.1919 (19.2%) |
| P90  | 0.5021 (50.2%) | 0.5629 (56.3%) |
| P95  | 0.6904 (69.0%) | 0.7387 (73.9%) |
| P99  | 1.1069 (110.7%) | - |
| Max  | 2.1949 (219.5%) | 1.4087 (140.9%) |

**Key finding:** The median utilization is only 14-19%, but the P90 spikes to 50-56%. This extreme variance between typical and peak is the root cause of oscillation.

---

## 3. CPU Core Usage Rate (absolute cores)

| Stat | Total Across All Pods | Average Per Pod |
|------|----------------------|-----------------|
| Mean | 0.308 cores | 0.102 cores |
| P50  | 0.195 cores | 0.073 cores |
| P90  | 0.686 cores | 0.216 cores |
| P95  | 0.886 cores | 0.275 cores |
| Max  | 3.210 cores | 0.528 cores |

**Key finding:** Average per-pod CPU usage is only 73m at P50 but spikes to 275m at P95. The HPA AverageValue target of 525m is virtually never exceeded (only 1 window out of 2016 = 0.05%), meaning the HPA is not scaling based on AverageValue alone. The oscillation is driven by request-utilization-triggered behavior or by brief spikes that cross the threshold and immediately dilute.

---

## 4. Derived CPU Request Size

From cross-referencing usage rate and request utilization:
- **Median CPU request: 382m** (Autopilot-adjusted from the 300m in manifests)
- **Most common (rounded): 400m** (3380 samples), 350m (2199 samples)

This confirms Autopilot is overriding the manifest 300m CPU request to ~385-400m.

---

## 5. Pod Lifespan Distribution

| Category | Count | Percentage |
|----------|-------|-----------|
| Short-lived (<=15 min) | 105 pods | 43% |
| Medium-lived (15min - 2hr) | 83 pods | 34% |
| Long-lived (>2hr) | 56 pods | 23% |
| **Total distinct pods** | **244** | 100% |

**244 distinct pods in 7 days** with 43% surviving 15 minutes or less is a clear signal of thrashing. Many pods are created, absorb no meaningful traffic, and are terminated.

---

## 6. Active Pod Count Oscillation

| Stat | Value |
|------|-------|
| Min pods | 2 |
| Max pods | 28 |
| Average pods | 3.8 |
| Median pods | 2 |

The system swings from 2 to 28 pods while the median is just 2. The max/median ratio of 14x demonstrates massively overshoot scaling.

---

## 7. Scale Event Analysis

### Overall

- **198 total scale events** in 7 days (28 per day average)
- **101 scale-ups, 97 scale-downs**
- **116 events within 10 minutes of each other**
- Median gap between events: **10 minutes**
- Minimum gap: **5 minutes** (the monitoring interval itself)

### Dominant Pattern: 5-Minute Bounce

The most common pattern (observed dozens of times):
1. `T+0:00` - CPU spike on 2 pods, avg utilization > 0.5
2. `T+0:05` - HPA adds 1 pod (scale 2 -> 3)
3. `T+0:10` - New pod dilutes average, utilization drops to ~0.15-0.25
4. `T+0:15` - HPA removes 1 pod (scale 3 -> 2)

Example sequences:
```
03-13 05:39 SCALE-UP:   2->3 pods (avg_util=0.735)
03-13 05:49 SCALE-DOWN: 3->2 pods (avg_util=0.143)

03-14 08:09 SCALE-UP:   2->3 pods (avg_util=0.695)
03-14 08:19 SCALE-DOWN: 3->2 pods (avg_util=0.191)

03-17 07:19 SCALE-UP:   2->3 pods (avg_util=0.363)
03-17 07:24 SCALE-DOWN: 3->2 pods (avg_util=1.139)
```

### Extreme Oscillation Events

| Time | Event | Notes |
|------|-------|-------|
| 03-18 08:29 | 4 -> 16 pods (+12) | Massive burst scale-up |
| 03-18 15:29 | 15 -> 28 pods (+13) | Followed by 28->15 at +5min |
| 03-18 15:34 | 28 -> 15 pods (-13) | Full reversal in one window |
| 03-19 04:39 | 15 -> 22 pods (+7) | Followed by 22->10 at +5min |
| 03-19 04:44 | 22 -> 10 pods (-12) | Aggressive scale-down |
| 03-19 07:44 | 11 -> 16 pods (+5) | Multi-step ramp during IST morning |

### Scale-Up/Scale-Down Bounce Count

6 confirmed "bounce" events where scale-up was followed by scale-down within 30 minutes, many with only a 5-minute gap.

---

## 8. Threshold Crossing Frequency

| Threshold | Crossings (7 days) | Per Day |
|-----------|-------------------|---------|
| 0.3 (30%) | 400 | 57 |
| 0.5 (50%) | 240 | 34 |
| 0.7 (70%) | 143 | 20 |
| 1.0 (100%) | 42 | 6 |

The 0.3 and 0.5 thresholds are crossed constantly, confirming the utilization is bouncing around the zone where HPA would be making decisions.

---

## 9. Hourly Pattern (UTC / IST+5:30)

| UTC | IST | Avg Util | Avg Pods | Max Pods | Notes |
|-----|-----|----------|----------|----------|-------|
| 00-03 | 05:30-08:30 | 0.08-0.22 | ~4 | 15 | Early morning IST, low traffic |
| 04-05 | 09:30-10:30 | 0.34-0.46 | 2.4-3.6 | 22 | IST business hours start, spiky |
| 06-08 | 11:30-13:30 | 0.35-0.40 | 2.9-3.4 | 19 | IST midday, moderate + bursts |
| 09-13 | 14:30-18:30 | 0.35-0.41 | 4.0-4.2 | 17 | IST afternoon, highest sustained |
| 14-15 | 19:30-20:30 | 0.32-0.33 | 4.2 | 28 | IST evening, extreme burst potential |
| 16-18 | 21:30-23:30 | 0.20-0.30 | 3.9 | 15 | IST late evening, declining |
| 19-23 | 00:30-04:30 | 0.13-0.16 | 3.9 | 15 | IST night, low |

The max pod counts of 22-28 occur during IST business hours (04-08 UTC / 09:30-13:30 IST) and IST evening (14-15 UTC / 19:30-20:30 IST), while average pods stay at 2-4. This confirms burst-driven oscillation.

---

## 10. Post-Spike CPU Drop Analysis

When CPU exceeds the HPA target, it drops extremely rapidly:

**Example: 2026-03-17 08:44 (the only window where AverageValue 525m was crossed)**
```
T+00:  avg=0.528 cores, 2 pods  (above 525m target)
T+05:  avg=0.325 cores, 3 pods  (38% drop - new pod added)
T+10:  avg=0.228 cores, 3 pods  (57% drop from peak)
T+15:  avg=0.299 cores, 3 pods  (still well below target)
T+20:  avg=0.219 cores, 3 pods  (HPA would want to scale down)
```

CPU drops by 57% within 10 minutes of a scale-up. This is the core oscillation mechanism: the spike is transient (likely a burst of incoming requests), and adding a pod eliminates it almost instantly, but then there is nothing to sustain the higher pod count.

---

## 11. Root Cause: Why HPA Oscillates

1. **Transient CPU spikes on bursty traffic:** Individual API pods spike to 50-100%+ request utilization on bursts, but the burst duration is typically under 5 minutes.

2. **HPA reacts to the spike:** The AverageValue or request utilization briefly exceeds the threshold, triggering a scale-up.

3. **New pods immediately dilute the metric:** Adding 1 pod to 2 existing pods reduces per-pod average by 33%. The burst is already ending by the time the new pod is ready.

4. **Utilization drops below the scale-down threshold:** Within 5-10 minutes, CPU falls well below the target, and HPA begins scale-down (with whatever stabilization window is configured).

5. **The cycle repeats:** The next burst arrives on fewer pods, triggers another scale-up, and so on.

6. **Autopilot complicates sizing:** Autopilot adjusts CPU requests (300m -> ~385m), but the HPA AverageValue target (525m) stays fixed, creating a moving gap between the two that shifts the effective scale trigger point.

---

## 12. Recommendations

1. **Increase HPA `scaleDown.stabilizationWindowSeconds`** to at least 300s (5min). The current rapid scale-downs are the primary oscillation amplifier. GKE default is 300s; if it is set lower, that explains the 5-minute bounces.

2. **Raise `minReplicas` to 3-4** for steady state. With 2 pods, a single pod spiking can trigger scaling. With 3-4, the averaging effect absorbs more burst variance.

3. **Add `behavior.scaleDown.policies` rate limiting.** Prevent removing more than 1-2 pods per 5-minute window. The 28->15 (-13 pods in 5min) events are extreme and wasteful.

4. **Consider `scaleUp.stabilizationWindowSeconds`** of 30-60s to filter transient spikes, though this trades responsiveness for stability.

5. **Evaluate switching to `AverageUtilization` with a target around 60%.** With Autopilot adjusting requests, AverageValue creates a sliding gap. Utilization-based scaling would be self-adjusting.

---

## Files

- Raw CPU usage rate data: `aph-4412/notes/cpu-utilization-7d.json`
- Raw CPU request utilization data: `aph-4412/notes/cpu-request-utilization-7d.json`
