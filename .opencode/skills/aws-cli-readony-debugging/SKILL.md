---
name: aws-cli-readonly-debugging
description: Use when debugging AWS via AWS CLI and you must stay read-only, return JSON-only output, prevent hallucinated commands/flags, and avoid retrieving or revealing secret values (no Secrets Manager, KMS, or SSM/Parameter Store).
compatibility: opencode
---

# AWS CLI Readonly Debugging

## What I do

- Run AWS CLI commands for debugging only (read-only, no AWS writes).
- Always use `--profile anyodeveloper` by default.
- Enforce JSON-only outputs and a strict anti-hallucination workflow.
- Prevent secret-value retrieval and redact sensitive-looking fields in outputs.
- Use subagents by default to avoid context rot from large AWS outputs.

## When to use me

- User asks to "debug AWS" (S3/EC2/CloudWatch/etc.) using AWS CLI.
- You must verify real AWS state (not guess) and return JSON-only output.
- You must not mutate AWS resources.

## Hard safety rules (non-negotiable)

### Forbidden AWS services (denylist)

Do not run any command that starts with these services:

- `aws secretsmanager ...`
- `aws ssm ...` (includes Parameter Store)
- `aws kms ...`

Surfacing ARNs is OK. Retrieving values is not.

### Forbidden value-retrieval patterns (deny even if service checks miss)

Refuse any command containing:

- `get-secret-value`
- `get-parameter`, `get-parameters`, `get-parameters-by-path`
- `--with-decryption`
- `kms decrypt`
- `generate-data-key`, `generate-data-key-without-plaintext`

### Forbidden state-changing operations (read-only guarantee)

Refuse any command that is state-changing (examples / keywords):

- `create`, `delete`, `update`, `put`, `modify`
- `reboot`, `stop`, `start`, `terminate`
- `attach`, `detach`, `associate`, `disassociate`
- `authorize`, `revoke`, `enable`, `disable`
- `tag`, `untag`

If the user requests a write ("restart", "rotate", "update", "fix it"), refuse and offer read-only diagnostics alternatives.

### No hallucinated commands or flags

If you are not sure about the exact AWS CLI operation/flags:

- Verify via `aws <service> <operation> help` (preferred), or
- Use websearch to confirm.

Do not invent flags. Do not guess operation names.

## JSON-only contract

- Every AWS CLI command must include: `--output json --no-cli-pager --profile anyodeveloper`
- Runner must set: `AWS_PAGER=""` and `AWS_CLI_AUTO_PROMPT=off`
- All user-facing responses must be JSON (use the envelope schema below). No prose.

Notes:

- `aws ... help` output is not JSON. It is allowed only for verification and must never be pasted to the user.

## Subagent-first workflow (required)

To prevent context rot and avoid copying large AWS outputs into the main context, always use two subagents:

### Subagent A: `docs-verifier`

Goal: produce one verified command string.

Inputs: user request, region/profile context, and this policy.

Process:

1. Confirm exact operation with `aws <svc> <op> help` or websearch.
2. Check policy: forbidden services, value-retrieval patterns, state-changing verbs.
3. Ensure the command includes `--output json --no-cli-pager`.

Output (JSON only):

```json
{
  "verified": true,
  "command": "aws ... --output json --no-cli-pager --profile anyodeveloper",
  "policy": { "allowed": true, "reasons": [] },
  "sources": ["aws help", "<optional url>"]
}
```

If not allowed: `verified=false`, `policy.allowed=false`, include refusal reasons and safe alternatives.

### Subagent B: `runner`

Goal: execute only the verified command, validate JSON, redact, persist artifacts, return the envelope.

Required environment/flags:

- `AWS_PAGER=""`
- `AWS_CLI_AUTO_PROMPT=off`
- Command includes `--output json --no-cli-pager`
- Command includes `--profile anyodeveloper`

Credential bootstrap (required; same shell session):

```bash
aws sso login --profile anyodeveloper
eval "$(node set-aws-identity.js)"
aws sts get-caller-identity --output json --no-cli-pager
```

This skill assumes credentials are fetched using `set-aws-identity.js` (repo root; can be referenced as `@set-aws-identity.js`).

Notes:

- `set-aws-identity.js` prints `export AWS_...` lines and writes `.aws-credentials.json` (gitignored). Never paste those exports into user output.
- If AWS commands fail with `ExpiredToken`/`UnrecognizedClientException`, re-run `aws sso login --profile anyodeveloper` then `eval "$(node set-aws-identity.js)"`.

Suggested runner sequence (avoid failing with stale creds):

1. Try: `aws sts get-caller-identity --output json --no-cli-pager`
2. If it fails due to auth, run:
   - `aws sso login --profile anyodeveloper`
   - `eval "$(node set-aws-identity.js)"`
   - retry `aws sts get-caller-identity ...`
3. Only then run the verified debugging command.

## Output envelope (JSON-only)

Return this strict envelope to the user (always JSON). Do not add extra top-level keys.

```json
{
  "ok": true,
  "sessionId": "<stable id>",
  "command": "<exact executed command>",
  "artifacts": {
    "command": "src/temp/aws-cli-debug/<sessionId>/command.json",
    "stdoutRedacted": "src/temp/aws-cli-debug/<sessionId>/stdout.redacted.json",
    "stderr": "src/temp/aws-cli-debug/<sessionId>/stderr.json",
    "meta": "src/temp/aws-cli-debug/<sessionId>/meta.json"
  },
  "result": {
    "highlights": []
  },
  "error": null
}
```

If refusing or failing, set `ok=false` and populate `error` with a machine-readable object.

Refusal example (still strict envelope; include safe alternatives, all JSON-only commands):

```json
{
  "ok": false,
  "sessionId": "<stable id>",
  "command": null,
  "artifacts": null,
  "result": {
    "highlights": [],
    "alternatives": [
      {
        "goal": "Check instance status checks",
        "command": "aws ec2 describe-instance-status --region us-east-1 --instance-ids i-... --include-all-instances --output json --no-cli-pager"
      }
    ]
  },
  "error": {
    "code": "READONLY_REFUSAL",
    "message": "State-changing operation requested (restart/reboot/stop/start)."
  }
}
```

## Artifact persistence (redacted-only by default)

Write artifacts under:

- `src/temp/aws-cli-debug/<sessionId>/`

Persist:

- `command.json`: exact command + non-secret execution context
- `stdout.redacted.json`: redacted JSON only
- `stderr.json`: stderr text as JSON (string/array)
- `meta.json`: exit code, duration, json parse ok, redaction stats

Do not persist raw stdout by default.

## Automatic redaction (post-fetch)

Redaction happens after fetching stdout and parsing it as JSON.

Default redaction rules:

- Redact values where the key name matches (case-insensitive):
  - `secret`, `password`, `token`, `apikey`, `api_key`, `accesskey`, `privatekey`, `sessiontoken`, `credential`
- Optional value pattern redaction:
  - JWT-like: `xxx.yyy.zzz`
  - PEM blocks: contains `-----BEGIN`

Replace with: `"[REDACTED]"`.

## Quick reference

Always:

- `--output json --no-cli-pager`
- `--profile anyodeveloper`
- `AWS_PAGER="" AWS_CLI_AUTO_PROMPT=off`
- `aws sts get-caller-identity --output json --no-cli-pager --profile anyodeveloper` (sanity)

Never:

- `aws secretsmanager ...`, `aws ssm ...`, `aws kms ...`
- `get-secret-value`, `get-parameter*`, `--with-decryption`, `kms decrypt`
- Any state-changing ops (`reboot`, `stop`, `start`, `terminate`, `modify`, ...)

## Common mistakes

- Pager enabled (breaks JSON-only): forgot `--no-cli-pager` or `AWS_PAGER=""`.
- Non-JSON AWS commands: forgot `--output json`.
- Credential export in a different terminal: `eval "$(node set-aws-identity.js)"` must be in the same shell session.
- Copy/pasting AWS credentials into chat/logs.

## Red flags (stop and refuse)

- "Just restart it" / "stop-start it" / "terminate it" (write operations)
- "Fetch parameter value" / "decrypt" / "get secret" (secret values)
- "I know the flag" without verifying via `aws ... help` (hallucination risk)

## Rationalizations to ignore

| Excuse | Reality |
| --- | --- |
| "It is only a reboot for debugging" | Still a state change. Refuse. |
| "It is safe because it is read-only" (SSM/KMS/Secrets Manager) | Value retrieval is out of scope. Refuse. |
| "Output is probably JSON" | Validate by parsing; otherwise fail. |
