# A1 Evidence Analysis — APH-4312
Collected: 2026-03-09

## Key Findings

### 1. HPA Name Discrepancy
- Actual HPA name: `anyo-api-hpa` (not `anyo-api`)
- state.yml had it wrong — corrected.

### 2. HPA Spec vs Prior Assumptions
| Parameter | state.yml assumption | Actual |
|---|---|---|
| HPA name | anyo-api | anyo-api-hpa |
| Metric type | cpu utilization % | AverageValue (absolute millicores) |
| maxReplicas | 10 | **50** |
| scaleUp stabilizationWindow | unknown | **0 seconds** |
| scaleDown stabilizationWindow | unknown | 300 seconds |

### 3. HpaProfilePerformance — The Core Culprit
- `kubectl describe` shows: `HpaProfilePerformance x241 over 33h` (~every 8 min)
- Raw API confirms `vpa-recommender` is managing HPA status (managedFields manager)
- **GKE Autopilot's performance profile is continuously overriding HPA decisions**
- This is separate from the CPU-metric-driven rescales

### 4. Scale Oscillation Pattern
Over 33 hours, the scale bounces between 2, 4, 5, and 6:
- Scale DOWN to 2: x61 events (most common, ~every 30 min)
- Scale UP to 4: x44 events
- Scale UP to 5: x17 events
- Scale DOWN to 4: x17 events
- Scale UP to 6: x10 events
- Scale DOWN to 5: x4 events

**Frequency**: multiple scale events per hour, every day.

### 5. Current State (at collection time)
- 4 replicas running at avg 34m CPU (HPA metric) — well below 225m target
- HPA condition: `ScaleDownStabilized` — wants to go down but held by 300s window
- Last scale event was 2 minutes ago (scaled UP to 4)
- Immediately before that, likely scaled down to 3 (matching the oscillation)

### 6. Scale-Up Trigger: Zero Stabilization Window
- `scaleUp.stabilizationWindowSeconds: 0` means any single CPU sample above 225m avg triggers immediate scale-out
- With 2 pods at startup: if a pod warms up and consumes >450m total, HPA fires within seconds
- New pods consume elevated CPU during cold start (observed: 77m and 83m on new pods vs 22m on older pods)
- Cold-start CPU spike on pod N+1 can trigger scale to N+2 before it stabilizes — cascading effect

### 7. vpa-recommender Interaction
- GKE Autopilot automatically activates a VPA recommender that also acts on HPAs
- The `HpaProfilePerformance` events suggest Autopilot is proactively over-provisioning based on its own resource profile
- This works against the HPA's downscale intent, causing the oscillation seen

## Root Cause Hypothesis (for A2)
1. **Primary**: scaleUp stabilizationWindowSeconds=0 + cold-start CPU spikes from new pods → every scale-up creates a temporary CPU surge that triggers another scale-up before pods stabilize
2. **Secondary**: GKE Autopilot vpa-recommender is actively overriding HPA with performance profile decisions (241x in 33h), independently keeping replica count higher than pure CPU math dictates
3. **Compounding**: maxReplicas=50 gives the HPA enormous headroom, preventing any ceiling-based throttling

## Recommended Next Steps (A2)
1. Add scaleUp stabilization window (60-120s) to absorb pod cold-start CPU spikes
2. Investigate if GKE Autopilot performance profile can be disabled or tuned
3. Consider whether 225m AverageValue target is appropriate given actual steady-state CPU (~20-30m per idle pod)
