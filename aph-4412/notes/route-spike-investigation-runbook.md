# Route-Level CPU/Memory Spike Investigation Runbook

When you see a CPU or memory spike on the Anyo Backend Ops dashboard, use these queries to identify which routes are responsible.

## Workflow

1. Note the spike window from the dashboard (e.g., 14:30-14:45 IST)
2. Run Query 1 to find the highest-traffic routes in that window
3. Run Query 2 to find the slowest routes (CPU-heavy candidates)
4. Run Query 3 to cross-reference: high traffic + slow = likely cause
5. Run Query 4 if you suspect errors are involved

---

## Logs Explorer Filters

Paste these into **GCP Console > Logging > Logs Explorer**.

### Query 1: All API requests in a time window (sort by newest)

Use this to eyeball which routes are flooding in during a spike.

```
resource.type="k8s_container"
resource.labels.namespace_name="anyo-backend"
resource.labels.container_name="api"
jsonPayload.req.url!=""
jsonPayload.responseTime>0
```

Then set the time range to the spike window. The histogram at the top shows request volume over time — look for the burst pattern.

### Query 2: Slow requests only (>2s response time)

These are the CPU-heavy candidates.

```
resource.type="k8s_container"
resource.labels.namespace_name="anyo-backend"
resource.labels.container_name="api"
jsonPayload.responseTime>2000
```

### Query 3: Slow requests on a specific route

Once you identify a suspect route from Query 1/2, drill in:

```
resource.type="k8s_container"
resource.labels.namespace_name="anyo-backend"
resource.labels.container_name="api"
jsonPayload.req.url=~"/app/bookAppointment"
jsonPayload.responseTime>1000
```

Replace `/app/bookAppointment` with the suspect route.

### Query 4: 5xx errors during the spike

```
resource.type="k8s_container"
resource.labels.namespace_name="anyo-backend"
resource.labels.container_name="api"
jsonPayload.res.statusCode>=500
```

### Query 5: Timeout monitor logs (requests >25s)

The backend's timeoutMonitor middleware already logs these:

```
resource.type="k8s_container"
resource.labels.namespace_name="anyo-backend"
resource.labels.container_name="api"
jsonPayload.event="request_timeout_warning"
```

---

## gcloud CLI Queries

For terminal-based investigation. Replace timestamps with your spike window.

### Top 20 routes by count in a 15-minute window

```bash
gcloud logging read '
  resource.type="k8s_container"
  resource.labels.namespace_name="anyo-backend"
  resource.labels.container_name="api"
  jsonPayload.req.url!=""
  timestamp>="2026-03-19T09:00:00Z"
  timestamp<="2026-03-19T09:15:00Z"
' --project=anyo-infra \
  --format='value(jsonPayload.req.method, jsonPayload.req.url, jsonPayload.responseTime)' \
  --limit=5000 \
| awk '{print $1, $2}' | sort | uniq -c | sort -rn | head -20
```

### Top 20 slowest requests in a window

```bash
gcloud logging read '
  resource.type="k8s_container"
  resource.labels.namespace_name="anyo-backend"
  resource.labels.container_name="api"
  jsonPayload.responseTime>2000
  timestamp>="2026-03-19T09:00:00Z"
  timestamp<="2026-03-19T09:15:00Z"
' --project=anyo-infra \
  --format='table(jsonPayload.responseTime, jsonPayload.req.method, jsonPayload.req.url, jsonPayload.req.headers.x-user-email)' \
  --limit=100 \
  --order=desc
```

### Combined: top routes by total response time (the real CPU burners)

This gives you routes ranked by `count * avg_response_time` — the actual CPU impact.

```bash
gcloud logging read '
  resource.type="k8s_container"
  resource.labels.namespace_name="anyo-backend"
  resource.labels.container_name="api"
  jsonPayload.req.url!=""
  jsonPayload.responseTime>0
  timestamp>="2026-03-19T09:00:00Z"
  timestamp<="2026-03-19T09:15:00Z"
' --project=anyo-infra \
  --format='value(jsonPayload.req.method, jsonPayload.req.url, jsonPayload.responseTime)' \
  --limit=5000 \
| awk '{
    route = $1 " " $2;
    count[route]++;
    total[route] += $3;
  }
  END {
    for (r in count)
      printf "%8.0f %5d %8.0f  %s\n", total[r], count[r], total[r]/count[r], r
  }' | sort -rn | head -20
```

Output columns: `total_ms  count  avg_ms  METHOD /route`

The route with the highest `total_ms` is your prime suspect — it consumed the most cumulative server time.

---

## Interpreting Results

| Pattern | Likely Cause |
|---------|-------------|
| One route has 10x the count of others | Traffic spike on that route (bot? retry storm? client bug?) |
| One route has very high avg_ms | Expensive query or external call (check DB/Sentry traces) |
| One route has high count AND high avg_ms | This is your CPU spike culprit |
| Many routes slow simultaneously | Pod-level issue (memory pressure, GC, noisy neighbor) |
| 5xx errors concentrated on one route | Route-specific bug, not infrastructure |

## What's on the Dashboard

The **"Top Routes by Request Rate"** stacked bar chart shows route traffic volume over time. Use it to visually spot which routes dominate during a spike window, then use the queries above to dig into latency and errors for those specific routes.

## Log-Based Metrics Available

Both metrics were created on 2026-03-19 and only have data from that point forward.

- `api_request_duration_ms` — distribution metric with labels: method, route, status
- `api_request_count` — counter metric with labels: method, route, status_class
