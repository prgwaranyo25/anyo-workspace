---
name: gcp-cli-readonly-debugging
description: Use when debugging GCP via gcloud CLI and you must stay read-only, return JSON-only output, prevent hallucinated commands/flags, and avoid retrieving or revealing secret values.
compatibility: opencode
---

# GCP CLI Readonly Debugging

## What I do

- Run `gcloud` commands for debugging only (read-only, no GCP writes).
- Always enforce JSON output (`--format=json`) and non-interactive mode (`--quiet`).
- Prevent secret-value retrieval and redact sensitive-looking fields in outputs.
- Use subagents by default to avoid context rot from large GCP outputs.

## When to use me

- User asks to "debug GCP" (GKE/VPC/IAM/etc.) using `gcloud`.
- You must verify real GCP state (not guess) and return JSON-only output.
- You must not mutate GCP resources.

## Hard safety rules (non-negotiable)

### Forbidden GCP services/commands (denylist)

Do not run any command that accesses secrets or sensitive data:

- `gcloud secrets versions access ...` (Secret Manager payload)
- `gcloud kms decrypt ...` (KMS decryption)
- `gcloud auth print-access-token ...` (Raw tokens)
- `gcloud auth print-identity-token ...`

Surfacing resource names/locations is OK. Retrieving values is not.

### Forbidden state-changing operations (read-only guarantee)

Refuse any command that is state-changing. Look for these verbs/keywords:

- `create`, `delete`, `update`, `apply`, `patch`
- `deploy`, `submit` (builds), `run` (jobs)
- `resize`, `scale` (clusters/instances)
- `reset` (instances)
- `set-iam-policy` (use `get-iam-policy` instead)
- `add-iam-policy-binding`, `remove-iam-policy-binding`

If the user requests a write ("restart", "scale up", "fix permissions"), refuse and offer read-only diagnostics alternatives.

### Mandatory Flags & Environment

- Every `gcloud` command must include: `--format=json --quiet`
- Runner must set environment variable: `CLOUDSDK_CORE_DISABLE_PROMPTS=1`

## JSON-only contract

- All user-facing responses must be JSON (use the envelope schema below). No prose.
- `gcloud ... --help` output is not JSON. It is allowed only for verification and must never be pasted to the user.

## Subagent-first workflow (required)

To prevent context rot, always use two subagents:

### Subagent A: `docs-verifier`

Goal: produce one verified command string.

Inputs: user request, project ID, and this policy.

Process:

1.  Confirm exact operation with `gcloud <group> <subgroup> <command> --help` or websearch.
2.  Check policy: forbidden services, value-retrieval patterns, state-changing verbs.
3.  Ensure the command includes `--format=json --quiet`.
4.  Ensure a project is specified (either via `--project` flag or verified context).

Output (JSON only):

```json
{
  "verified": true,
  "command": "gcloud ... --format=json --quiet --project anyo-dev",
  "policy": { "allowed": true, "reasons": [] },
  "sources": ["gcloud help", "<optional url>"]
}
```

### Subagent B: `runner`

Goal: execute only the verified command, validate JSON, redact, persist artifacts, return the envelope.

Required environment:
- `CLOUDSDK_CORE_DISABLE_PROMPTS=1`

Credential bootstrap (required; same shell session):
- Ensure `gcloud auth login` or `gcloud auth application-default login` has been run (if not already authenticated).
- *Note: For this skill, we assume the environment is already authenticated or uses a service account.*

## Output envelope (JSON-only)

Return this strict envelope to the user (always JSON).

```json
{
  "ok": true,
  "sessionId": "<stable id>",
  "command": "<exact executed command>",
  "artifacts": {
    "command": "src/temp/gcp-cli-debug/<sessionId>/command.json",
    "stdoutRedacted": "src/temp/gcp-cli-debug/<sessionId>/stdout.redacted.json",
    "stderr": "src/temp/gcp-cli-debug/<sessionId>/stderr.json",
    "meta": "src/temp/gcp-cli-debug/<sessionId>/meta.json"
  },
  "result": {
    "highlights": []
  },
  "error": null
}
```

## Automatic redaction (post-fetch)

Redaction happens after fetching stdout and parsing it as JSON.

Default redaction rules:
- Redact values where the key name matches (case-insensitive):
  - `password`, `token`, `secret`, `key`, `certificate`, `private_key`, `client_secret`
- Optional value pattern redaction:
  - JWT-like: `xxx.yyy.zzz`
  - PEM blocks: contains `-----BEGIN`

Replace with: `"[REDACTED]"`

## Quick reference

Always:
- `--format=json --quiet`
- `CLOUDSDK_CORE_DISABLE_PROMPTS=1`

Never:
- `secrets versions access`, `kms decrypt`
- `create`, `update`, `delete`, `apply`, `set-iam-policy`

## Common mistakes

- Forgot `--format=json`: Output will be text/table, breaking the JSON contract.
- Forgot `--quiet`: Script might hang on prompts.
- Forgot `--project`: Command might run in wrong project or fail.
