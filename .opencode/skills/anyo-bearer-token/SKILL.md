---
name: anyo-bearer-token
description: Fetch a Firebase ID token (Bearer) for Anyobackendapi via verifyPassword.
compatibility: opencode
---

## What I do

- Obtain a Firebase `idToken` using the Identity Toolkit `verifyPassword` endpoint.
- Return the token as a raw string so it can be used as `Authorization: Bearer <token>` for Anyobackendapi.

## Required inputs (via environment variables)

- `ANYO_EMAIL`: User email.
- `ANYO_PASSWORD`: User password.

This skill hardcodes the Firebase Web API key (as requested). Never hardcode user credentials.

## Constants

- Firebase Web API key: `AIzaSyApoVuNGIhdUfkm9RLhGil28_IDO49t25Q`

## Command (curl + jq)

```bash
curl -sS \
  -H 'Content-Type: application/json' \
  -d '{"email":"'"$ANYO_EMAIL"'","password":"'"$ANYO_PASSWORD"'","returnSecureToken":true}' \
  "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=AIzaSyApoVuNGIhdUfkm9RLhGil28_IDO49t25Q" \
| jq -r '.idToken'
```

## Command (curl + python fallback; no jq needed)

```bash
curl -sS \
  -H 'Content-Type: application/json' \
  -d '{"email":"'"$ANYO_EMAIL"'","password":"'"$ANYO_PASSWORD"'","returnSecureToken":true}' \
  "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=AIzaSyApoVuNGIhdUfkm9RLhGil28_IDO49t25Q" \
| python -c 'import json,sys; print(json.load(sys.stdin)["idToken"])'
```

## Usage example

```bash
TOKEN="$(<the command above>)"
curl -H "Authorization: Bearer $TOKEN" "${ANYO_BACKEND_BASE_URL:-https://anyobackendapi.example}/health"
```

## Troubleshooting

- If the response contains `error.message`, print the whole JSON to see the reason (bad password, user disabled, etc.).
- If env vars are missing, stop and ask the user to set them (do not guess or prompt for secrets in chat logs).
