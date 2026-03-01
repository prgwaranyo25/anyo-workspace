---
name: start-backend-project
description: Use when starting the anyobackendapi backend locally and AWS temp credentials may be required for encryption/KMS/CSFLE before the server boots.
compatibility: opencode
---

# Start Backend Project

## What I do

- Start the backend locally (recommended: read-only dev mode).
- If startup requires AWS credentials (KMS / client-side encryption / CSFLE), set temporary AWS env vars via `set-aws-identity.js` before starting.

## Quick start

From repo root:

```bash
pnpm install
pnpm run dev:readonly
```

Alternative (nodemon):

```bash
nodemon --config nodemon_read.json
```

## If AWS creds are required (encryption / KMS / CSFLE)

You likely need this if you see errors mentioning:

- `mongodb-client-encryption`, `kms`, `ClientEncryption`
- `AccessDeniedException`, `UnrecognizedClientException`, `ExpiredToken`
- `Could not load credentials`, `Missing credentials in config`

Do this in the SAME terminal session you will run the server from:

```bash
aws sso login --profile anyodeveloper
eval "$(node set-aws-identity.js)"
pnpm run dev:readonly
```

If `eval "$(...)"` isn't available in your shell, run the script and copy/paste the printed `export AWS_...` lines:

```bash
node set-aws-identity.js
pnpm run dev:readonly
```

Note: `set-aws-identity.js` also writes `.aws-credentials.json` (gitignored) for editor/launch configs.

## Troubleshooting AWS auth errors

If you see `UnrecognizedClientException`, `ExpiredToken`, or "security token is invalid":

```bash
aws sso login --profile anyodeveloper
eval "$(node set-aws-identity.js)"
aws sts get-caller-identity
pnpm run dev:readonly
```

## Common mistakes

- Running `set-aws-identity.js` in one terminal tab and starting the server in another (env vars won't carry over).
- Running `node set-aws-identity.js` but not applying the printed `export AWS_...` lines.
- Using `pnpm run dev` when you meant `pnpm run dev:readonly`.
- Forgetting to refresh SSO (`aws sso login --profile anyodeveloper`) before exporting credentials.
