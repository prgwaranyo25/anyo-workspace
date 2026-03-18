# Dashboard drift findings

- Ticket: `APH-4412`
- Date: `2026-03-18`
- Project: `anyo-infra`
- Live dashboard: `projects/645745792518/dashboards/d3ce1c2c-f27e-4ba9-92bb-a1708dc6bdeb`

## What was checked

- Listed live Monitoring dashboards with:
  - `gcloud monitoring dashboards list --project=anyo-infra --format=json --quiet`
- Compared the live `Anyo Backend Ops` dashboard to the Terraform definition in:
  - `infra/gcp/terraform/stacks/monitoring/main.tf`

## Result

- Live `Anyo Backend Ops` currently contains only 2 widgets:
  - `Uptime Check (health)`
  - `GCLB 5xx rate`
- Terraform defines 8 widgets for the same dashboard, including:
  - `CPU Request Utilization`
  - `Memory Request Utilization`
  - `API HPA Scale Events`

## Root cause assessment

- This is confirmed live dashboard drift, not a missing Terraform definition.
- Repo migration notes already say the monitoring stack was applied in prod with `alert policies + dashboard` on `2026-02-23`.
- Most likely explanation: the live dashboard was manually edited/saved after the Terraform apply, leaving only the first row.

## Operational implication

- The console dashboard is currently not sufficient for event-capacity analysis because the CPU, memory, and HPA widgets are absent from the live resource.
- A read-only `terraform plan -lock=false` against prod state confirms the dashboard would be restored by Terraform, but a full stack apply is currently noisy and unsafe for a focused dashboard-only fix.

## Terraform plan findings

- Verified with a prod-state plan on `infra/gcp/terraform/stacks/monitoring` using:
  - `project_id=anyo-infra`
  - `relay_service_url=https://monitoring-alert-relay-2mzqk56jlq-el.a.run.app`
  - `relay_invoker_service_account_email=sa-mon-alert-relay-inv@anyo-infra.iam.gserviceaccount.com`
- Plan summary: `2 to add, 2 to change, 4 to destroy`
- Relevant desired dashboard change:
  - update `google_monitoring_dashboard.backend_ops` in place to add the missing widgets.
- Additional unrelated plan changes detected:
  - create `google_logging_metric.startup_duration`
  - create temporary `google_monitoring_alert_policy.discord_test`
  - destroy live Cloud Build Pub/Sub relay resources still present in state but absent from current code.

## Recommended execution path

- For today's event preparation, use a targeted Terraform apply for `google_monitoring_dashboard.backend_ops` only.
- Do not run a full monitoring stack apply until the code/state drift is reconciled for:
  - Cloud Build Pub/Sub relay resources
  - temporary `discord_test` alert
  - optional `startup_duration_ms` metric ownership

## Follow-up reconciliation result

- Updated Terraform in `infra/gcp/terraform/stacks/monitoring/main.tf` to:
  - restore Cloud Build Pub/Sub topic, publisher binding, and push subscription resources to code,
  - remove the temporary `discord_test` alert from code,
  - remove undeployed startup widgets and the `startup_duration_ms` logging metric from code.
- Local verification:
  - `terraform -chdir=infra/gcp/terraform/stacks/monitoring fmt`
  - `terraform -chdir=infra/gcp/terraform/stacks/monitoring validate`
  - result: `Success! The configuration is valid.`
- Updated prod-state plan (`-lock=false`) now shows only:
  - in-place update to `google_monitoring_dashboard.backend_ops`
  - in-place update to `google_monitoring_alert_policy.gclb_latency`
- Plan summary after code reconciliation: `0 to add, 2 to change, 0 to destroy`
- This means a targeted apply for `google_monitoring_dashboard.backend_ops` is now isolated and safe for restoring the missing capacity widgets.

## Apply outcome

- A stale Terraform state lock was blocking apply:
  - object: `gs://anyo-tfstate-prod/monitoring/default.tflock`
  - lock payload showed `OperationTypePlan` from `2026-02-24T06:16:55Z`
- Removed the stale lock and retried apply.
- First retry partially succeeded:
  - `google_monitoring_alert_policy.gclb_latency` updated successfully
  - dashboard update failed with schema error: `xyChart.dataSets[].title` is invalid for Cloud Monitoring dashboard JSON
- Minimal fix applied in Terraform:
  - replaced `title` with `legendTemplate` for the HPA series labels
- Re-verified with:
  - `terraform -chdir=infra/gcp/terraform/stacks/monitoring fmt`
  - `terraform -chdir=infra/gcp/terraform/stacks/monitoring validate`
  - prod-state `terraform plan -lock=false ...`
- Final apply result:
  - `Apply complete! Resources: 0 added, 1 changed, 0 destroyed.`
  - output `dashboard_name = projects/645745792518/dashboards/d3ce1c2c-f27e-4ba9-92bb-a1708dc6bdeb`
- Final convergence check:
  - `No changes. Your infrastructure matches the configuration.`

## HPA widget follow-up fix

- After the dashboard was restored, the `API HPA Scale Events` widget still errored in the console.
- Root cause: the widget filter used `resource.type="k8s_hpa"`, but Cloud Monitoring exposes `kubernetes.io/hpa/desired_replicas` and `kubernetes.io/hpa/current_replicas` on monitored resource type `k8s_scale`, not `k8s_hpa`.
- Fix applied in Terraform:
  - switched both HPA series filters to `resource.type="k8s_scale"`
  - constrained them to the actual scale target labels:
    - `project_id=anyo-infra`
    - `location=asia-south1`
    - `cluster_name=anyo-gke-autopilot-as1`
    - `namespace_name=anyo-backend`
    - `controller_api_group_name=apps`
    - `controller_kind=Deployment`
    - `controller_name=anyo-api`
- Supporting config alignment:
  - added `cluster_name` and `api_workload_name` variables in `infra/gcp/terraform/stacks/monitoring/variables.tf`
  - set `cluster_name=anyo-gke-autopilot-as1`, `api_workload_name=anyo-api`, and updated `api_hpa_max_replicas=50` in `infra/gcp/terraform/tfvars/monitoring-asia-south1.common.tfvars`
- Verification:
  - `terraform -chdir=infra/gcp/terraform/stacks/monitoring validate`
  - prod `terraform apply ...`
  - final prod-state `terraform plan -lock=false ...`
  - result: `No changes. Your infrastructure matches the configuration.`

## Empty chart follow-up fix

- After the `k8s_scale` resource-type fix, the HPA chart still showed `0 time series` without an error.
- Root cause: the filter was valid but overconstrained. For dashboard queries on `k8s_scale`, the safest specific filter for this case is the scaled target itself, not every possible cluster metadata label.
- Simplified both HPA filters to:
  - `metric.type="kubernetes.io/hpa/desired_replicas" AND resource.type="k8s_scale" AND resource.labels.namespace_name="anyo-backend" AND resource.labels.controller_kind="Deployment" AND resource.labels.controller_name="anyo-api"`
  - `metric.type="kubernetes.io/hpa/current_replicas" AND resource.type="k8s_scale" AND resource.labels.namespace_name="anyo-backend" AND resource.labels.controller_kind="Deployment" AND resource.labels.controller_name="anyo-api"`
- Re-verified with:
  - `terraform -chdir=infra/gcp/terraform/stacks/monitoring validate`
  - prod `terraform apply ...`
  - final prod-state `terraform plan -lock=false ...`
- Result: apply succeeded and Terraform converged cleanly again.

## Event-day HPA recommendation

- Updated repo HPA floor in `infra/gcp/k8s/base/api/hpa.yaml`:
  - `minReplicas: 2` -> `minReplicas: 10`
  - left `maxReplicas: 50` unchanged
- Why `10`:
  - historical prod `appEventsLog` burst windows showed roughly `84` and `162` unique `APP_OPEN` users in 5-minute windows,
  - dashboard CPU request utilization for `api` peaked well below saturation and memory remained low, which suggests headroom per pod,
  - but the HPA scales on `averageValue: 525m` CPU, which is much higher than the request-utilization ratios shown in the dashboard and may delay reactive scale-up,
  - startup/readiness warm-up is non-trivial, so a larger warm pool reduces event-entry risk.
- Operational recommendation for today's event:
  - run with `minReplicas: 10`
  - if the audience is expected to arrive in a sharp first-wave burst, prefer `12`
  - keep `maxReplicas: 50` so HPA can still burst above the floor.

## CSV / CLI note

- `gcloud` CLI still does not provide a direct historical Cloud Monitoring dashboard CSV export path for these graphs.
- If CSV is needed, use the Monitoring console / Metrics Explorer export flow, or query the Monitoring API directly rather than `gcloud monitoring ...`.

## Additional note

- `infra/gcp/terraform/tfvars/monitoring-asia-south1.common.tfvars` still sets `api_hpa_max_replicas = 10`, while the live API HPA is currently configured to `maxReplicas: 50` in Kubernetes.
- That value appears stale and currently unused by the monitoring stack, but it should be reconciled if this stack later consumes it.
