# APH-3760 Ops Runbook (Draft)

Goal: make `*.e.staging.anyo.co` reachable without ALB and without NAT Gateway.

## Current Findings

- `https://aph-4204.e.staging.anyo.co/version` returns `504` from the ALB after ~60s.
- Backend is reachable directly over Tailscale: `http://100.75.153.19:<hostPort>/version`.
- Root cause for the existing ALB proxy path: the original staging proxy instance lives in a private subnet with broken egress (default route to a blackhole NAT, no VPC endpoints), which breaks proxy automation and likely upstream reachability.

## Target Architecture (No ALB)

- Route53 wildcard `*.e.staging.anyo.co` -> Elastic IP of a public "staging-proxy" EC2.
- Caddy runs on the proxy:
  - wildcard TLS for `*.e.staging.anyo.co` via Let's Encrypt DNS-01 (Route53)
  - routes each branch host to `http://100.75.153.19:<dynamicHostPort>`
- A small sync service keeps routing current by reading ECS Anywhere tasks and updating the proxy config.

## Proxy Host Requirements

- Public subnet with IGW route (no NAT Gateway needed).
- Security group:
  - inbound `80/443` from `0.0.0.0/0`
  - inbound `22` only from a trusted CIDR (avoid `0.0.0.0/0`)
  - outbound allow all
- Instance profile permissions:
  - ECS read: `ecs:ListServices`, `ecs:ListTasks`, `ecs:DescribeTasks`, `ecs:DescribeServices`
  - Route53 for DNS-01: `route53:ChangeResourceRecordSets` scoped to the hosted zone for `e.staging.anyo.co` (+ list/get hosted zone permissions)

## Caddy Configuration Shape

To ensure a wildcard certificate is used, structure the Caddyfile with a single wildcard site:

```caddyfile
*.e.staging.anyo.co {
    tls {
        dns route53
    }

    import /etc/caddy/sites.d/*.caddy
}
```

The sync service writes per-branch snippets intended to be imported inside the wildcard block:

```caddyfile
@anyo_staging_external_aph_4204 host aph-4204.e.staging.anyo.co
handle @anyo_staging_external_aph_4204 {
    reverse_proxy 100.75.153.19:32768
}
```

## Verification

- From proxy: `curl http://100.75.153.19:<hostPort>/version` returns expected build.
- From internet: `curl https://aph-4204.e.staging.anyo.co/version` returns quickly (no 504).
- Caddy logs show successful DNS-01 issuance and renewals.
