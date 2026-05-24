# Cortex API Usage Guide

This guide is the practical integration reference for Cortex. It covers the public OpenAI-compatible API, admin operations API, user self-service API, ChatGPT multi-account management, streaming, client examples, errors, quotas, and production usage notes.

No real API key is included here. Replace every `ctx_replace_me` value with a key issued by your own Cortex admin panel.

## Table of Contents

- [Architecture in One Minute](#architecture-in-one-minute)
- [Base URLs](#base-urls)
- [Authentication](#authentication)
- [Quick Start](#quick-start)
- [Public OpenAI-Compatible API](#public-openai-compatible-api)
- [Chat Completions](#chat-completions)
- [Streaming SSE](#streaming-sse)
- [Model IDs](#model-ids)
- [JavaScript Examples](#javascript-examples)
- [Python Examples](#python-examples)
- [Postman](#postman)
- [Admin API](#admin-api)
- [ChatGPT Multi-Account API](#chatgpt-multi-account-api)
- [User Self-Service API](#user-self-service-api)
- [Errors and Status Codes](#errors-and-status-codes)
- [Quotas and Logging](#quotas-and-logging)
- [Reliability Playbook](#reliability-playbook)
- [Security Checklist](#security-checklist)

## Architecture in One Minute

Cortex presents a clean API boundary to clients and keeps provider browser automation behind an authenticated operator surface.

```mermaid
flowchart LR
    A[Apps, SDKs, scripts] --> B[/v1 OpenAI-compatible API]
    B --> C[API key validation]
    C --> D[Provider registry]
    D --> E[Browser-backed providers]
    F[Admin UI and /api routes] --> C
    F --> D
    F --> G[SQLite logs, keys, users, audits]
```

Core idea:

| Plane | Routes | Auth | Purpose |
| --- | --- | --- | --- |
| Public data plane | `/v1/*` | Cortex API key | Client traffic |
| Health | `/health` | none | Liveness checks |
| Admin control plane | `/api/*` admin routes | Admin JWT | Operators, providers, keys, logs |
| User self-service | `/api/user/*` | User JWT | User dashboard and key requests |
| Browser access | `/novnc/*` | Deployment-dependent | Provider login and visual recovery |

Provider login/logout is intentionally blocked on public `/v1/login/:provider` and `/v1/logout/:provider`. Use the admin UI or authenticated admin API.

## Base URLs

Local backend default:

```text
http://localhost:31338
```

Docker Compose ingress default:

```text
http://localhost:31339
```

Production example:

```text
https://cortex.example.com
```

OpenAI SDK base URL:

```text
https://cortex.example.com/v1
```

## Authentication

### Public API Key

Public `/v1` routes require an API key by default.

Supported headers:

```http
X-API-Key: ctx_replace_me
```

or:

```http
Authorization: Bearer ctx_replace_me
```

Recommended shell setup:

```bash
export CORTEX_BASE_URL="http://localhost:31339"
export CORTEX_API_KEY="ctx_replace_me"
```

PowerShell:

```powershell
$env:CORTEX_BASE_URL = "http://localhost:31339"
$env:CORTEX_API_KEY = "ctx_replace_me"
```

### Admin JWT

Admin routes require an admin JWT after login.

```bash
curl "$CORTEX_BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"replace-me"}'
```

Use the returned token:

```bash
export CORTEX_ADMIN_TOKEN="eyJ_replace_me"
```

Then call admin routes:

```bash
curl "$CORTEX_BASE_URL/api/auth/me" \
  -H "Authorization: Bearer $CORTEX_ADMIN_TOKEN"
```

### User JWT

User routes under `/api/user/*` use a separate token returned by `/api/user/login`.

## Quick Start

1. Start Cortex.
2. Open `/admin/`.
3. Log in as an admin.
4. Connect providers or create ChatGPT accounts.
5. Issue an API key.
6. Call `/v1/models`.
7. Send a chat completion.

Minimal smoke test:

```bash
curl "$CORTEX_BASE_URL/health"

curl "$CORTEX_BASE_URL/v1/models" \
  -H "X-API-Key: $CORTEX_API_KEY"

curl "$CORTEX_BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CORTEX_API_KEY" \
  -d '{
    "model": "web-chatgpt/gpt-5.4-pro",
    "messages": [
      { "role": "user", "content": "Say hello in one sentence." }
    ],
    "stream": false,
    "newConversation": true
  }'
```

## Public OpenAI-Compatible API

| Endpoint | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/health` | `GET` | none | Liveness check |
| `/v1/models` | `GET` | API key | OpenAI-style model catalog |
| `/v1/status` | `GET` | API key | Provider and service state |
| `/v1/chat/completions` | `POST` | API key | Chat completion |
| `/v1/login/:provider` | `POST` | API key, always forbidden | Login is admin-only |
| `/v1/logout/:provider` | `POST` | API key, always forbidden | Logout is admin-only |

### GET /health

```bash
curl "$CORTEX_BASE_URL/health"
```

Typical response:

```json
{
  "status": "ok",
  "service": "cortex",
  "version": "0.2.0"
}
```

### GET /v1/models

```bash
curl "$CORTEX_BASE_URL/v1/models" \
  -H "X-API-Key: $CORTEX_API_KEY"
```

Response shape:

```json
{
  "object": "list",
  "data": [
    {
      "id": "web-chatgpt/gpt-5.4-pro",
      "object": "model",
      "created": 0,
      "owned_by": "openai"
    }
  ]
}
```

Use this endpoint as the runtime source of truth.

### GET /v1/status

```bash
curl "$CORTEX_BASE_URL/v1/status" \
  -H "X-API-Key: $CORTEX_API_KEY"
```

Response shape:

```json
{
  "running": true,
  "port": 31338,
  "version": "0.2.0",
  "uptime": 3600,
  "providers": [
    {
      "name": "chatgpt",
      "connected": true,
      "hasProfile": true,
      "sessionValid": true,
      "models": ["web-chatgpt/gpt-5.4-pro"]
    }
  ]
}
```

## Chat Completions

Endpoint:

```http
POST /v1/chat/completions
```

Request schema:

```json
{
  "model": "web-chatgpt/gpt-5.4-pro",
  "messages": [
    { "role": "system", "content": "You are concise." },
    { "role": "user", "content": "Summarize Cortex." }
  ],
  "stream": false,
  "newConversation": true,
  "temperature": 0.7,
  "max_tokens": 300
}
```

Fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `model` | string | yes | Must match `/v1/models` |
| `messages` | array | yes | Ordered chat messages |
| `messages[].role` | `system`, `user`, `assistant` | yes | OpenAI-style role |
| `messages[].content` | string | yes | Message content |
| `stream` | boolean | no | `false` by default |
| `newConversation` | boolean | no | Starts a fresh provider conversation when supported |
| `temperature` | number | no | Generation preference |
| `max_tokens` | number | no | Completion length hint |

Non-streaming request:

```bash
curl "$CORTEX_BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CORTEX_API_KEY" \
  -d '{
    "model": "web-grok/grok-expert",
    "messages": [
      { "role": "system", "content": "You are concise." },
      { "role": "user", "content": "Give me a one-line status." }
    ],
    "stream": false,
    "newConversation": true,
    "temperature": 0.4,
    "max_tokens": 120
  }'
```

Response:

```json
{
  "id": "chatcmpl-1713360000000",
  "object": "chat.completion",
  "model": "web-grok/grok-expert",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Cortex is online and ready."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 8,
    "total_tokens": 50
  }
}
```

Usage is estimated by Cortex and should not be treated as provider billing truth.

## Streaming SSE

Set `stream: true`.

```bash
curl -N "$CORTEX_BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CORTEX_API_KEY" \
  -d '{
    "model": "web-chatgpt/gpt-5.4-thinking",
    "messages": [
      { "role": "user", "content": "Write a two-line uptime note." }
    ],
    "stream": true,
    "newConversation": true
  }'
```

Chunk format:

```text
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","model":"web-chatgpt/gpt-5.4-thinking","choices":[{"index":0,"delta":{"content":"Systems"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","model":"web-chatgpt/gpt-5.4-thinking","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":42,"completion_tokens":30,"total_tokens":72}}

data: [DONE]
```

Streaming client rules:

- append `choices[0].delta.content` in order
- keep reading until `data: [DONE]`
- handle a final usage chunk
- handle in-stream errors when a provider fails after response headers are sent
- disable proxy buffering for SSE routes in production

## Model IDs

Active providers in the current registry:

- `chatgpt`
- `grok`
- `gemini`

Current model IDs:

| Provider | Model ID | Display |
| --- | --- | --- |
| ChatGPT | `web-chatgpt/gpt-5.4-pro` | GPT-5.4 Pro |
| ChatGPT | `web-chatgpt/gpt-5.4-thinking` | GPT-5.4 Thinking |
| ChatGPT | `web-chatgpt/gpt-5.3-instant` | GPT-5.3 Instant |
| ChatGPT | `web-chatgpt/gpt-5-thinking-mini` | GPT-5 Thinking Mini |
| ChatGPT | `web-chatgpt/o3` | o3 |
| Grok | `web-grok/grok-expert` | Grok Expert |
| Grok | `web-grok/grok-fast` | Grok Fast |
| Grok | `web-grok/grok-heavy` | Grok Heavy |
| Grok | `web-grok/grok-4.20-beta` | Grok 4.20 Beta |
| Gemini | `web-gemini/gemini-3-fast` | Gemini 3 Fast |
| Gemini | `web-gemini/gemini-3-thinking` | Gemini 3 Thinking |
| Gemini | `web-gemini/gemini-3.1-pro` | Gemini 3.1 Pro |

Provider implementations for other names may exist in source, but they are not live unless registered and returned by `/v1/models`.

## JavaScript Examples

### fetch

```js
const baseUrl = process.env.CORTEX_BASE_URL ?? "http://localhost:31339";
const apiKey = process.env.CORTEX_API_KEY;

if (!apiKey) throw new Error("Set CORTEX_API_KEY");

const response = await fetch(`${baseUrl}/v1/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  },
  body: JSON.stringify({
    model: "web-gemini/gemini-3-thinking",
    messages: [
      { role: "system", content: "You are concise." },
      { role: "user", content: "Explain Cortex in one paragraph." },
    ],
    stream: false,
    newConversation: true,
    temperature: 0.5,
    max_tokens: 250,
  }),
});

if (!response.ok) {
  const text = await response.text();
  throw new Error(`Cortex error ${response.status}: ${text}`);
}

const data = await response.json();
console.log(data.choices[0]?.message?.content ?? "");
```

### OpenAI SDK

```js
import OpenAI from "openai";

const baseUrl = process.env.CORTEX_BASE_URL ?? "http://localhost:31339";

const client = new OpenAI({
  apiKey: process.env.CORTEX_API_KEY,
  baseURL: `${baseUrl}/v1`,
});

const completion = await client.chat.completions.create({
  model: "web-chatgpt/gpt-5.4-pro",
  messages: [
    { role: "system", content: "You are concise." },
    { role: "user", content: "Give me a one-line health summary." },
  ],
  stream: false,
  temperature: 0.4,
  max_tokens: 120,
});

console.log(completion.choices[0]?.message?.content ?? "");
```

## Python Examples

### requests

```python
import os
import requests

base_url = os.environ.get("CORTEX_BASE_URL", "http://localhost:31339")
api_key = os.environ["CORTEX_API_KEY"]

payload = {
    "model": "web-grok/grok-expert",
    "messages": [
        {"role": "system", "content": "You are concise."},
        {"role": "user", "content": "Summarize Cortex in one line."},
    ],
    "stream": False,
    "newConversation": True,
    "temperature": 0.7,
    "max_tokens": 150,
}

r = requests.post(
    f"{base_url}/v1/chat/completions",
    headers={"Content-Type": "application/json", "X-API-Key": api_key},
    json=payload,
    timeout=120,
)
r.raise_for_status()
print(r.json()["choices"][0]["message"]["content"])
```

### OpenAI SDK

```python
import os
from openai import OpenAI

base_url = os.environ.get("CORTEX_BASE_URL", "http://localhost:31339")

client = OpenAI(
    api_key=os.environ["CORTEX_API_KEY"],
    base_url=f"{base_url}/v1",
)

completion = client.chat.completions.create(
    model="web-chatgpt/gpt-5.4-pro",
    messages=[
        {"role": "system", "content": "You are concise."},
        {"role": "user", "content": "Say hello in one sentence."},
    ],
    stream=False,
    temperature=0.5,
    max_tokens=120,
)

print(completion.choices[0].message.content)
```

Install:

```bash
pip install --upgrade openai requests
```

## Postman

The repository includes:

```text
cortex.postman_collection.json
```

Recommended collection variables:

| Variable | Example |
| --- | --- |
| `baseUrl` | `http://localhost:31339` |
| `apiKey` | `ctx_replace_me` |
| `adminUsername` | `admin` |
| `adminPassword` | `replace-me` |
| `adminToken` | `eyJ_replace_me` |
| `defaultPrompt` | `Say hello in 5 words` |
| `defaultTemp` | `0.7` |
| `defaultMaxTokens` | `150` |

Workflow:

1. Import the collection.
2. Set `baseUrl`.
3. Set `apiKey`.
4. Run `GET /health`.
5. Run `GET /v1/models`.
6. Test non-streaming chat.
7. Test streaming chat.
8. Log in as admin and set `adminToken`.
9. Use provider, account, logs, stats, and key-management requests.

## Admin API

Admin routes are for trusted operators.

### Auth and Identity

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/auth/login` | `POST` | Admin login |
| `/api/auth/logout` | `POST` | Admin logout audit |
| `/api/auth/me` | `GET` | Current admin identity and permissions |
| `/api/admin/permissions` | `GET` | Role permission map |
| `/api/health` | `GET` | Admin API health |

### Admin Accounts

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/admin/admins` | `GET` | List admins |
| `/api/admin/admins` | `POST` | Create admin |
| `/api/admin/admins/:id/password` | `PATCH` | Change admin password |
| `/api/admin/admins/:id/role` | `PATCH` | Change role |
| `/api/admin/admins/:id` | `DELETE` | Delete admin |

### API Keys, Users, Requests

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/admin/keys` | `GET` | List API keys |
| `/api/admin/keys` | `POST` | Create API key |
| `/api/admin/keys/:id` | `PATCH` | Update key name, limits, active state |
| `/api/admin/keys/:id` | `DELETE` | Delete API key |
| `/api/admin/users` | `GET` | List users |
| `/api/admin/users/:id` | `GET` | User detail |
| `/api/admin/users/:id/status` | `PATCH` | Activate or suspend user |
| `/api/admin/users/:id/password` | `PATCH` | Reset user password |
| `/api/admin/users/:id/keys` | `POST` | Issue a key for one user |
| `/api/admin/user-requests` | `GET` | List key requests |
| `/api/admin/user-requests/:id/approve` | `POST` | Approve request |
| `/api/admin/user-requests/:id/reject` | `POST` | Reject request |
| `/api/admin/usage` | `GET` | Usage summary |

### Providers, Logs, Config

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/providers/status` | `GET` | Provider session health |
| `/api/providers/models` | `GET` | Models, usage, provider status, VNC metadata |
| `/api/providers/:provider/login` | `POST` | Start provider browser login for non-pooled providers |
| `/api/providers/:provider/logout` | `POST` | Logout provider |
| `/api/providers/:provider/cooldown` | `GET` | Cooldown policy |
| `/api/providers/:provider/cooldown` | `PATCH` | Update cooldown policy |
| `/api/playground/chat` | `POST` | Admin playground chat |
| `/api/logs` | `GET` | Request logs |
| `/api/logs/prune` | `POST` | Delete old logs |
| `/api/audit-logs` | `GET` | Audit events |
| `/api/stats` | `GET` | Dashboard stats |
| `/api/config` | `GET` | Runtime config |
| `/api/config` | `POST` | Update runtime config |

## ChatGPT Multi-Account API

ChatGPT is currently the account-pooled provider. Each account can have a separate profile directory, browser context, health state, cooldown, priority, and noVNC display slot.

### Why this exists

The account pool lets operators:

- keep multiple ChatGPT sessions available
- recover one account without affecting the entire provider
- cool down accounts that hit provider-side friction
- route requests across healthy accounts
- open the exact browser stream for one account

### Account Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/accounts?provider=chatgpt` | `GET` | List accounts |
| `/api/accounts` | `POST` | Create account |
| `/api/accounts/:id` | `PATCH` | Update label, enabled flag, notes, priority |
| `/api/accounts/:id` | `DELETE` | Delete account and profile |
| `/api/accounts/:id/login` | `POST` | Start login for one account |
| `/api/accounts/:id/logout` | `POST` | Logout one account |
| `/api/accounts/:id/check` | `POST` | Check session health |
| `/api/accounts/:id/pages` | `GET` | List live pages |
| `/api/accounts/:id/screenshot` | `GET` | Browser screenshot |
| `/api/accounts/:id/reset-cooldown` | `POST` | Clear cooldown |
| `/api/accounts/:id/force-cooldown` | `POST` | Force cooldown |
| `/api/browsers` | `GET` | Browser dashboard feed |

### Create Account

```bash
curl "$CORTEX_BASE_URL/api/accounts" \
  -H "Authorization: Bearer $CORTEX_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "chatgpt",
    "label": "team-primary",
    "notes": "Primary ChatGPT account for team traffic"
  }'
```

Response shape:

```json
{
  "account": {
    "id": "account-id",
    "provider": "chatgpt",
    "label": "team-primary",
    "profileDir": "/home/node/.cortex/profiles/chatgpt-account-id",
    "enabled": true,
    "status": "unknown",
    "cooldownUntil": null,
    "inCooldown": false,
    "cooldownSecondsRemaining": 0,
    "lastUsedAt": null,
    "lastError": null,
    "errorCount24h": 0,
    "priority": 100,
    "displaySlot": 0,
    "vncPath": "/novnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=novnc/d0/websockify",
    "createdAt": "2026-01-01 00:00:00",
    "createdBy": "admin-id",
    "notes": "Primary ChatGPT account for team traffic"
  }
}
```

### Login One Account

```bash
curl "$CORTEX_BASE_URL/api/accounts/account-id/login" \
  -H "Authorization: Bearer $CORTEX_ADMIN_TOKEN" \
  -X POST
```

Open the returned account `vncPath` or the Accounts/Browsers page and complete provider login in that account browser.

### Account Routing Rules

For ChatGPT requests:

1. Disabled accounts are skipped.
2. Accounts in cooldown are skipped.
3. Lower `priority` wins.
4. Similar priority accounts rotate by least-recently-used behavior.
5. If a provider-side account failure is detected, Cortex applies cooldown and tries another healthy account when possible.

### Cooldowns

Cooldown exists to keep a single unhealthy account from harming the whole pool.

Typical reasons:

- `rate_limited`
- `unusual_activity`
- `session_expired`

Inspect policy:

```bash
curl "$CORTEX_BASE_URL/api/providers/chatgpt/cooldown" \
  -H "Authorization: Bearer $CORTEX_ADMIN_TOKEN"
```

Clear one account:

```bash
curl "$CORTEX_BASE_URL/api/accounts/account-id/reset-cooldown" \
  -H "Authorization: Bearer $CORTEX_ADMIN_TOKEN" \
  -X POST
```

### noVNC and Display Slots

Each slotted account has a path like:

```text
/novnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=novnc/d0/websockify
```

Notes:

- the Browsers page uses per-account `vncPath`
- `/api/providers/models` includes shared VNC metadata for the VNC page and Playground
- shared VNC metadata prefers a connected account slot when available
- if no connected slotted account exists, Cortex falls back to the shared VNC endpoint

## User Self-Service API

These routes support the user dashboard and user-owned API key requests.

| Endpoint | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/user/register` | `POST` | none | Register user |
| `/api/user/login` | `POST` | none | Login and receive user JWT |
| `/api/user/me` | `GET` | user JWT | Current user |
| `/api/user/logout` | `POST` | user JWT | Logout response |
| `/api/user/keys` | `GET` | user JWT | List user keys |
| `/api/user/keys/request` | `POST` | user JWT | Request API key |
| `/api/user/keys/requests` | `GET` | user JWT | Request history |
| `/api/user/usage` | `GET` | user JWT | Usage summary |
| `/api/user/logs` | `GET` | user JWT | User-scoped logs |

## Errors and Status Codes

Public `/v1` errors use an OpenAI-like shape:

```json
{
  "error": {
    "message": "Unknown model: web-unknown/demo",
    "type": "invalid_request"
  }
}
```

Admin/user routes usually use:

```json
{
  "error": "Authentication required",
  "code": "AUTH_REQUIRED"
}
```

Common statuses:

| Status | Meaning | Typical Fix |
| --- | --- | --- |
| `400` | Invalid body or parameter | Check JSON and required fields |
| `401` | Missing/invalid key or token | Send correct auth |
| `403` | Disabled key, missing permission, forbidden route | Use active key or admin route |
| `404` | Unknown endpoint, model, account, user | Refresh IDs/catalog |
| `409` | Conflict such as duplicate account label | Use a unique value |
| `429` | Daily limit or rate limit exceeded | Back off or change quota |
| `503` | Provider unavailable or disconnected | Reconnect provider/account |

## Quotas and Logging

API keys are checked in this order:

1. Key exists.
2. Key is active.
3. Daily usage is below `daily_limit`.
4. Requests in the last minute are below `rate_limit_per_min`.

Request logs can include:

- provider
- model
- API key identity
- HTTP status
- response time
- token estimates
- request payload snapshot
- response payload snapshot
- error message
- IP address
- user agent
- ChatGPT account ID and label when account routing is used

Useful admin routes:

- `GET /api/logs`
- `GET /api/stats`
- `GET /api/audit-logs`
- `GET /api/admin/usage`

## Reliability Playbook

Client-side:

- call `/v1/models` at startup
- set client timeouts
- use `newConversation: true` for isolated work
- retry `429` with backoff
- do not retry `400`, `401`, or `403` blindly
- treat `503` as a provider/session health problem
- consume streaming responses until `[DONE]`

Operator-side:

- keep `~/.cortex` persisted
- monitor `/v1/status`
- monitor request logs and audit logs
- keep provider sessions connected
- use the Browsers page for per-account visual checks
- cool down or disable unhealthy ChatGPT accounts

Production proxy notes:

- disable buffering for SSE
- allow long-running requests
- protect `/admin`, `/api`, and `/novnc`
- use HTTPS in front of the stack

## Security Checklist

- Do not commit real API keys.
- Rotate any key that appeared in docs, logs, screenshots, terminal history, or chat.
- Keep `CORTEX_REQUIRE_API_KEY` enabled unless you are intentionally running a private dev instance.
- Set `CORTEX_ADMIN_PASSWORD` before first boot.
- Set `CORTEX_ADMIN_JWT_SECRET`.
- Issue separate API keys per app, user, or team.
- Set daily and per-minute quotas.
- Restrict admin routes to trusted operators.
- Treat noVNC as privileged browser access.
- Remember logs may contain prompts and responses.

