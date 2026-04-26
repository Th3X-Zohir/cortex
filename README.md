# cortex

OpenAI-compatible AI gateway for browser-authenticated providers, with an admin panel, API key management, request logging, and self-hosted operations support.

## Table of Contents

- [What This Project Is](#what-this-project-is)
- [Who This Is For](#who-this-is-for)
- [Current Provider Status](#current-provider-status)
- [Core Capabilities](#core-capabilities)
- [How It Works](#how-it-works)
- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [First-Time Setup Walkthrough](#first-time-setup-walkthrough)
- [Using the API](#using-the-api)
- [Public API Reference](#public-api-reference)
- [Admin API Reference](#admin-api-reference)
- [Configuration](#configuration)
- [Storage and Persistence](#storage-and-persistence)
- [Docker Deployment](#docker-deployment)
- [Production Guidance](#production-guidance)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Project Structure](#project-structure)
- [Roadmap and Known Limitations](#roadmap-and-known-limitations)
- [Contributing](#contributing)
- [License](#license)

## What This Project Is

`cortex` is a self-hosted HTTP service that exposes selected browser-based AI providers behind an OpenAI-compatible API surface.

Instead of calling an official provider API directly, `cortex` uses persistent Playwright-driven browser sessions to interact with provider web apps. That lets you:

- authenticate once in a real browser session
- persist session state across restarts
- present one unified `/v1` API to clients
- control access with your own API keys
- operate the service through an admin UI and admin API

The service also includes:

- an admin web application served at `/admin`
- API key issuance, rotation, disablement, and quotas
- request logging and token usage estimation
- provider connection health and model visibility
- SQLite-backed operational data
- Docker support with Xvfb, VNC, and noVNC

## Who This Is For

`cortex` is aimed at operators who want to run a personal or team-accessible AI gateway in front of browser-based provider sessions.

Typical use cases:

- internal tooling that expects an OpenAI-compatible endpoint
- a private bridge for applications that cannot integrate with each provider separately
- a self-hosted admin-operated service where browser logins are managed centrally
- experimentation with browser-backed providers through one stable client interface

This project is not a drop-in replacement for official provider APIs in the strict protocol sense. It is an operational bridge that emulates the parts of the OpenAI API this codebase currently implements.

## Current Provider Status

This section reflects the current codebase as of `README.md` in this repository, not aspirational support.

### Registered web providers

These are currently registered in [src/registry.ts](/D:/Jihan/cortex/src/registry.ts):

| Provider | Status | Notes |
| --- | --- | --- |
| `grok` | Enabled | Browser-authenticated |
| `gemini` | Enabled | Browser-authenticated |
| `chatgpt` | Enabled | Browser-authenticated |

### Present in repository but not currently registered

These implementations exist in `src/providers`, but are not currently active in the registry:

| Provider | Status |
| --- | --- |
| `claude` | Present in code, not registered |
| `claude-api` | Present in code, not registered |
| `gemini-api` | Present in code, not registered |
| `codex-api` | Present in code, not registered |

If you are opening this project publicly, do not advertise disabled providers as supported until they are wired into [src/registry.ts](/D:/Jihan/cortex/src/registry.ts), surfaced in admin flows, and validated end-to-end.

### Current model IDs

Runtime model availability comes from the registered providers and is exposed by `GET /v1/models`.

#### Grok

- `web-grok/grok-expert`
- `web-grok/grok-fast`
- `web-grok/grok-heavy`
- `web-grok/grok-4.20-beta`

#### Gemini

- `web-gemini/gemini-3-fast`
- `web-gemini/gemini-3-thinking`
- `web-gemini/gemini-3.1-pro`

#### ChatGPT

- `web-chatgpt/gpt-5.4-pro`
- `web-chatgpt/gpt-5.4-thinking`
- `web-chatgpt/gpt-5.3-instant`
- `web-chatgpt/gpt-5-thinking-mini`
- `web-chatgpt/o3`

## Core Capabilities

- OpenAI-compatible `POST /v1/chat/completions`
- `GET /v1/models` model listing
- `GET /v1/status` provider health and session state
- API key enforcement enabled by default
- per-key daily quota and per-minute rate limit enforcement
- request logging with provider, model, timing, payload snapshots, and usage estimates
- browser session persistence under `~/.cortex`
- admin authentication with JWT
- multi-admin support with roles and permissions
- user registration and API key request workflows
- Dockerized runtime with remote browser access

## How It Works

At a high level:

1. `cortex` runs an HTTP server.
2. An operator logs into a provider through the authenticated admin panel.
3. The provider session is stored in a persistent Playwright profile on disk.
4. Client applications call `cortex` using an OpenAI-style request body.
5. `cortex` routes the request to the provider associated with the selected model ID.
6. The provider adapter drives the browser UI, streams or collects the response, and `cortex` returns an OpenAI-compatible response shape.

Operationally, this means the browser session is part of your production dependency surface. Session expiration, provider UI changes, rate limits, and anti-automation defenses are all relevant.

## Architecture Overview

```text
Client App / SDK
        |
        |  OpenAI-compatible HTTP requests
        v
+---------------------------+
|         cortex            |
|                           |
|  Public API               |
|  - /v1/chat/completions   |
|  - /v1/models             |
|  - /v1/status             |
|  - /health                |
|                           |
|  Admin Surface            |
|  - /admin                 |
|  - /api/*                 |
|                           |
|  Core Services            |
|  - Provider registry      |
|  - API key validation     |
|  - Request logging        |
|  - SQLite admin store     |
+-------------+-------------+
              |
              v
     Playwright browser contexts
      |         |            |
      v         v            v
    Grok      Gemini      ChatGPT
```

Relevant implementation files:

- [src/server.ts](/D:/Jihan/cortex/src/server.ts): HTTP server, public API routes, auth enforcement, static admin hosting
- [src/registry.ts](/D:/Jihan/cortex/src/registry.ts): provider registration, model lookup, session restore, keepalive
- [src/config.ts](/D:/Jihan/cortex/src/config.ts): defaults, persisted config, environment overrides
- [src/admin/api.ts](/D:/Jihan/cortex/src/admin/api.ts): admin routes, auth, permissions, provider controls
- [src/admin/store.ts](/D:/Jihan/cortex/src/admin/store.ts): SQLite schema, API key issuance, logs, usage, users
- [src/providers](/D:/Jihan/cortex/src/providers): provider-specific browser automation

## Quick Start

### Prerequisites

- Node.js `>= 20`
- npm
- a host capable of running Chromium via Playwright
- credentials for the providers you want to connect

### Install

```bash
git clone https://github.com/Th3X-Zohir/cortex.git
cd cortex
npm install
npm --prefix admin install
```

### Build

```bash
npm run build
npm --prefix admin run build
```

### Start the server

```bash
node dist/cli.js start --host=0.0.0.0 --port=31338
```

By default:

- public API listens on `0.0.0.0:31338`
- admin UI is served from `http://localhost:31338/admin/`
- API key enforcement is enabled

### Open the admin panel

Visit:

```text
http://localhost:31338/admin/
```

Default bootstrap credentials are created automatically on first run unless overridden by environment variables:

- username: `admin`
- password: `admin`

Change these immediately.

### Build order matters

The backend serves the built admin bundle from `admin/dist`. If you start the server without building the admin app first, `/`, `/docs`, and `/admin` will not serve the expected UI.

## First-Time Setup Walkthrough

This is the recommended operator flow.

### 1. Start the service

```bash
npm run build
npm --prefix admin run build
node dist/cli.js start
```

### 2. Sign into the admin panel

Open `http://localhost:31338/admin/` and log in with the bootstrap admin account.

If you did not set `CORTEX_ADMIN_PASSWORD`, the first admin will be created with:

- username: `admin`
- password: `admin`

### 3. Change the admin password

Do this before exposing the instance anywhere outside your machine or LAN.

### 4. Connect one or more providers

Use the admin provider controls to start browser-backed login for:

- `grok`
- `gemini`
- `chatgpt`

Important:

- provider login is managed through the authenticated admin surface
- `POST /v1/login/:provider` is intentionally blocked with `403`
- `POST /v1/logout/:provider` is intentionally blocked with `403`

That behavior is implemented in [src/server.ts](/D:/Jihan/cortex/src/server.ts).

### 5. Create an API key

Use the admin panel or admin API to create a consumer key. Public `/v1` requests require a valid API key by default.

Each key has:

- a name
- a daily request limit
- a per-minute rate limit
- an active or disabled state

### 6. Verify health and models

```bash
curl http://localhost:31338/health
curl http://localhost:31338/v1/models -H "X-API-Key: YOUR_KEY"
curl http://localhost:31338/v1/status -H "X-API-Key: YOUR_KEY"
```

### 7. Send a chat completion request

```bash
curl http://localhost:31338/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "model": "web-chatgpt/gpt-5.4-pro",
    "messages": [
      { "role": "system", "content": "You are concise." },
      { "role": "user", "content": "Say hello in one sentence." }
    ],
    "stream": false
  }'
```

## Using the API

### Authentication

Public `/v1` endpoints require an API key unless you explicitly disable enforcement with configuration.

Supported header formats:

```http
X-API-Key: ctx_...
```

or

```http
Authorization: Bearer ctx_...
```

That extraction logic is implemented in [src/server.ts](/D:/Jihan/cortex/src/server.ts).

### Base URL

Local default:

```text
http://localhost:31338
```

If you deploy behind reverse proxy or the included nginx compose setup, your public base URL will differ.

### OpenAI SDK example

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.CORTEX_API_KEY,
  baseURL: "http://localhost:31338/v1",
});

const completion = await client.chat.completions.create({
  model: "web-grok/grok-expert",
  messages: [
    { role: "system", content: "You are concise." },
    { role: "user", content: "Explain cortex in one sentence." }
  ]
});

console.log(completion.choices[0]?.message?.content);
```

### Plain `fetch` example

```ts
const response = await fetch("http://localhost:31338/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": process.env.CORTEX_API_KEY ?? ""
  },
  body: JSON.stringify({
    model: "web-chatgpt/gpt-5.4-thinking",
    messages: [
      { role: "user", content: "Write a short haiku about logs." }
    ],
    stream: false
  })
});

if (!response.ok) {
  throw new Error(await response.text());
}

const data = await response.json();
console.log(data.choices?.[0]?.message?.content);
```

### Python example

```python
import requests

resp = requests.post(
    "http://localhost:31338/v1/chat/completions",
    headers={
        "Content-Type": "application/json",
        "X-API-Key": "ctx_your_key_here",
    },
    json={
        "model": "web-gemini/gemini-3-fast",
        "messages": [
            {"role": "user", "content": "Return one short sentence."}
        ],
        "stream": False,
    },
    timeout=120,
)

resp.raise_for_status()
print(resp.json()["choices"][0]["message"]["content"])
```

## Public API Reference

This is the currently implemented public API surface in [src/server.ts](/D:/Jihan/cortex/src/server.ts).

### `GET /health`

Auth: not required

Purpose:

- liveness check
- simple version visibility

Example response:

```json
{
  "status": "ok",
  "service": "cortex",
  "version": "0.2.0"
}
```

### `GET /v1/models`

Auth: required by default

Returns the registered runtime models in OpenAI-like list format.

Example response:

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

### `GET /v1/status`

Auth: required by default

Returns service and provider health.

Example response shape:

```json
{
  "running": true,
  "port": 31338,
  "version": "0.2.0",
  "uptime": 123,
  "providers": [
    {
      "name": "chatgpt",
      "connected": true,
      "hasProfile": true,
      "sessionValid": true,
      "models": [
        "web-chatgpt/gpt-5.4-pro"
      ]
    }
  ]
}
```

### `POST /v1/chat/completions`

Auth: required by default

Implements the project’s OpenAI-compatible chat completion route.

Supported request fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `model` | `string` | Yes | Must exist in `GET /v1/models` |
| `messages` | `array` | Yes | Ordered chat messages |
| `stream` | `boolean` | No | Default `false` |
| `temperature` | `number` | No | Provider-dependent behavior |
| `max_tokens` | `number` | No | Provider-dependent behavior |
| `newConversation` | `boolean` | No | Default `false`; forces a fresh provider-side conversation when supported |

Supported message roles in current shared types:

- `system`
- `user`
- `assistant`

Internally, provider prompt composition may flatten messages into provider-specific browser input text.

#### Non-streaming request example

```json
{
  "model": "web-grok/grok-expert",
  "messages": [
    { "role": "system", "content": "You are concise." },
    { "role": "user", "content": "Summarize this project." }
  ],
  "stream": false,
  "newConversation": true
}
```

#### Non-streaming response example

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
        "content": "A self-hosted OpenAI-compatible gateway for browser-backed AI providers."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 18,
    "total_tokens": 60
  }
}
```

#### Streaming behavior

If `stream: true`, the server returns `text/event-stream`.

Chunk shape:

```text
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","model":"web-chatgpt/gpt-5.4-pro","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","model":"web-chatgpt/gpt-5.4-pro","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":42,"completion_tokens":10,"total_tokens":52}}

data: [DONE]
```

Notes:

- some stream chunks may include `cortex_meta` when provider adapters expose extra runtime metadata
- usage is emitted in the terminal chunk
- provider-side failure may surface as an SSE error payload during streaming

### Public routes that are intentionally forbidden

These endpoints return `403` on purpose:

- `POST /v1/login/:provider`
- `POST /v1/logout/:provider`

Reason:

- browser login/logout is an operator action
- operator actions are handled through the authenticated admin surface
- exposing them on the public `/v1` surface would be a deployment footgun

## Admin API Reference

This is the authenticated operational API under `/api/*`. It is implemented in [src/admin/api.ts](/D:/Jihan/cortex/src/admin/api.ts).

### Authentication flow

1. `POST /api/auth/login`
2. receive admin JWT
3. send `Authorization: Bearer <token>` to subsequent admin requests

### Important admin routes

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/auth/login` | `POST` | Admin login |
| `/api/auth/logout` | `POST` | Admin logout |
| `/api/auth/me` | `GET` | Current admin identity and permissions |
| `/api/admin/permissions` | `GET` | Current effective permission set |
| `/api/providers/status` | `GET` | Provider session health |
| `/api/providers/models` | `GET` | Models plus status and model-level usage |
| `/api/providers/:provider/login` | `POST` | Start browser login flow |
| `/api/providers/:provider/logout` | `POST` | Disconnect a provider |
| `/api/playground/chat` | `POST` | Admin playground chat |
| `/api/admin/keys` | `GET`, `POST` | List and create API keys |
| `/api/admin/keys/:id` | `PATCH`, `DELETE` | Update or delete API keys |
| `/api/logs` | `GET` | Request logs with filters |
| `/api/logs/prune` | `POST` | Delete old logs |
| `/api/audit-logs` | `GET` | Audit history |
| `/api/stats` | `GET` | Dashboard metrics |
| `/api/config` | `GET`, `POST` | Read and update runtime config |
| `/api/admin/admins` | `GET`, `POST` | Manage admins |
| `/api/admin/admins/:id/role` | `PATCH` | Update admin role |
| `/api/admin/admins/:id/password` | `PATCH` | Reset admin password |
| `/api/admin/admins/:id` | `DELETE` | Delete admin |
| `/api/admin/users` | `GET` | List users |
| `/api/admin/user-requests` | `GET` | Review user API key requests |
| `/api/admin/user-requests/:id/approve` | `POST` | Approve and issue key |
| `/api/admin/user-requests/:id/reject` | `POST` | Reject key request |

### End-user routes

There is also a user-oriented auth and request flow in the admin backend:

- `POST /api/user/register`
- `POST /api/user/login`
- `GET /api/user/me`
- `POST /api/user/logout`
- `GET /api/user/keys`
- `POST /api/user/keys/request`
- `GET /api/user/keys/requests`
- `GET /api/user/usage`
- `GET /api/user/logs`

If you plan to market this project publicly, this is worth documenting in separate operator and end-user docs later. For now, this README calls it out so the surface area is not hidden.

## Configuration

Configuration is loaded from:

```text
~/.cortex/config.json
```

Default values are defined in [src/config.ts](/D:/Jihan/cortex/src/config.ts).

### Default runtime config

```json
{
  "port": 31338,
  "host": "0.0.0.0",
  "profileBaseDir": "~/.cortex/profiles",
  "headless": false,
  "logLevel": "info",
  "apiKeys": {},
  "admin": {
    "dbPath": "~/.cortex/admin.db",
    "tokenTtlSeconds": 28800,
    "requireApiKey": true,
    "logRetentionDays": 90,
    "corsOrigin": "*"
  }
}
```

### Environment variables

The current code directly reads these environment variables:

| Variable | Purpose |
| --- | --- |
| `CORTEX_ADMIN_DB` | SQLite admin DB path |
| `CORTEX_ADMIN_JWT_SECRET` | Admin JWT signing secret |
| `CORTEX_ADMIN_TOKEN_TTL_SECONDS` | Admin token TTL |
| `CORTEX_REQUIRE_API_KEY` | Set to `false` to disable public API key enforcement |
| `CORTEX_LOG_RETENTION_DAYS` | Log retention default |
| `CORTEX_CORS_ORIGIN` | CORS allow-origin value |
| `CORTEX_ADMIN_USERNAME` | Initial bootstrap admin username |
| `CORTEX_ADMIN_PASSWORD` | Initial bootstrap admin password |

For `port`, `host`, `headless`, and `logLevel`, the current supported paths are:

- CLI flags such as `cortex start --port=31338 --host=0.0.0.0`
- persisted config in `~/.cortex/config.json`

### CLI

The current CLI is useful for process startup, status, and config inspection:

```bash
cortex start [--port=31338] [--host=0.0.0.0] [--log-level=info] [--headless=false]
cortex status [--api-key <ctx_...>]
cortex config
cortex config <key> <value>
```

Important:

- `cortex login <provider>` still exists in the CLI help, but the server currently blocks `/v1/login/:provider`
- for real operator usage, treat provider login as an admin-panel or admin-API action

## Storage and Persistence

`cortex` stores runtime state under the current user’s home directory by default.

### Typical layout

```text
~/.cortex/
├── admin.db
├── admin-jwt-secret
├── config.json
├── profiles/
│   ├── grok-profile/
│   ├── gemini-profile/
│   └── chatgpt-profile/
├── grok-expiry.json
├── gemini-expiry.json
└── chatgpt-expiry.json
```

Repository-local or container-local runtime artifacts may also include:

```text
logs/
dist/
admin/dist/
data/
```

### What persists

- admin accounts
- JWT secret file if not supplied by env
- issued API keys and quotas
- request logs
- audit logs
- user accounts and API key requests
- Playwright browser profiles per provider

If you lose `~/.cortex`, you lose browser sessions and operational metadata unless you have backed it up.

## Docker Deployment

This repository ships with:

- a `Dockerfile`
- a `docker-compose.yml`
- an nginx reverse proxy config under [nginx/default.conf](/D:/Jihan/cortex/nginx/default.conf)
- an entrypoint script under [docker-entrypoint.sh](/D:/Jihan/cortex/docker-entrypoint.sh)

### What the container includes

The Docker image installs:

- Node 20
- Playwright Chromium and its dependencies
- Xvfb
- x11vnc
- noVNC and websockify
- desktop session components needed for remote browser login

### Compose setup

Current compose behavior from [docker-compose.yml](/D:/Jihan/cortex/docker-compose.yml):

- `cortex` container exposes internal ports `31338`, `5900`, `6080`
- `cortex-proxy` publishes host port `31339`
- nginx fronts the app on `31339`
- the compose stack mounts `./data`, `./logs`, and a named volume for `~/.cortex`

Start it with:

```bash
docker compose up --build
```

Then access the proxied app on:

```text
http://localhost:31339
```

Operational note from repository docs:

- host `31339` maps to nginx `:80`
- nginx proxies to `cortex:31338`
- noVNC routes are also exposed through that ingress

### Building the image directly

```bash
docker build -t cortex .
docker run -p 31338:31338 -p 5900:5900 -p 6080:6080 cortex
```

### Docker recommendations

- persist `~/.cortex` or the mapped volume, or browser sessions will be lost
- persist logs if you care about auditability
- use an external reverse proxy for TLS in real deployments
- do not leave the bootstrap admin password in place

## Production Guidance

This project is workable as a self-hosted service, but production-readiness here means operational discipline, not just “it starts.”

### Minimum production checklist

- set `CORTEX_ADMIN_PASSWORD` before first boot
- set `CORTEX_ADMIN_JWT_SECRET`
- keep `CORTEX_REQUIRE_API_KEY=true`
- issue distinct API keys per consumer or team
- set sane daily and per-minute limits
- persist `~/.cortex`, logs, and SQLite data
- put the service behind HTTPS
- restrict admin access by network boundary or upstream auth where possible
- monitor request logs and audit logs
- be ready to reconnect providers after session expiration or provider UI changes

### Reverse proxy recommendations

- terminate TLS upstream
- restrict `/admin` and `/api` to trusted users or networks
- preserve `Authorization` and `X-API-Key` headers
- disable proxy buffering for SSE if you rely on streaming

### Browser-session realities

Because providers are web-driven rather than official API-driven:

- login sessions can expire
- MFA or captcha flows may interrupt automation
- provider UI changes can break selectors
- provider-side anti-abuse systems can block or rate-limit automation
- headless versus headed behavior may differ by provider

Treat provider adapters as operational integrations that need maintenance.

## Security Notes

### API keys are required by default

Public API key enforcement defaults to `true`. Missing keys return `401`, invalid keys return `401`, disabled keys return `403`, and quota/rate exhaustion returns `429`.

### Bootstrap admin credentials are insecure by design

If no admin exists, the app seeds:

- username `admin`
- password `admin`

That is only acceptable for local first boot. Change it immediately.

### JWT secret handling

If `CORTEX_ADMIN_JWT_SECRET` is not set, the app writes a generated secret to:

```text
~/.cortex/admin-jwt-secret
```

That is operationally acceptable for local usage, but explicit secret management is better for controlled deployments.

### Logs may contain sensitive payloads

Request logs can include:

- request payload snapshots
- response payload snapshots
- user prompts
- generated responses
- IP address and user-agent

Do not expose the database or logs casually.

### Do not disable API keys unless you understand the blast radius

Setting `CORTEX_REQUIRE_API_KEY=false` makes the public API unauthenticated. That may be useful for tightly isolated local development, but it is not appropriate for exposed environments.

## Troubleshooting

### `/v1/chat/completions` returns `401 API key required`

Cause:

- API key enforcement is on
- request did not include `X-API-Key` or `Authorization: Bearer ...`

Fix:

- create a key in the admin panel
- send it in one of the supported headers

### `/v1/chat/completions` returns `503 <provider> is not connected`

Cause:

- provider browser session is not active or could not be restored

Fix:

- log in through the admin provider controls
- verify a profile exists under `~/.cortex/profiles`
- check `GET /v1/status`

### `/v1/login/:provider` returns `403`

Cause:

- that route is intentionally blocked

Fix:

- use `/admin`
- or use `POST /api/providers/:provider/login` with admin JWT

### Root page or admin UI is unavailable

Cause:

- `admin/dist` is missing

Fix:

```bash
npm --prefix admin install
npm --prefix admin run build
```

### Browser session does not persist

Cause:

- `~/.cortex` or mounted profile volume is not persistent
- profile directory permissions are wrong
- provider invalidated the session

Fix:

- persist `~/.cortex`
- verify write permissions
- reconnect through admin UI

### Streaming does not behave correctly behind proxy

Cause:

- SSE buffering by upstream proxy

Fix:

- disable proxy buffering for the streaming endpoint
- verify the client consumes `text/event-stream`

### ChatGPT requests fail intermittently

Possible causes:

- provider-side rate limits
- unusual activity checks
- browser automation drift

Fix:

- inspect request logs and server logs
- reconnect the provider
- retry with `newConversation: true`
- expect occasional maintenance when provider web behavior changes

### Docker instance starts but provider login is difficult

Cause:

- remote browser workflow not being used correctly

Fix:

- use the exposed VNC or noVNC path from the compose setup
- complete the interactive login there

## Development

See also:

- [CONTRIBUTING.md](/D:/Jihan/cortex/CONTRIBUTING.md)
- [API_USAGE_GUIDE.md](/D:/Jihan/cortex/API_USAGE_GUIDE.md)

### Backend

```bash
npm install
npm run build
npm run typecheck
npm test
```

### Admin app

```bash
npm --prefix admin install
npm --prefix admin run build
```

### Local development workflow

Terminal 1:

```bash
npm run build
npm run dev
```

Terminal 2:

```bash
npm --prefix admin run dev
```

Notes:

- backend dev watches `dist/cli.js`, so build first
- admin dev server runs on port `5173`
- admin dev server proxies API requests to port `31338`

### Validation before merging changes

For backend changes:

```bash
npm run typecheck
npm test
```

For backend packaging or entrypoint changes:

```bash
npm run build
```

For admin UI changes:

```bash
npm --prefix admin run build
```

## Project Structure

### Core backend

- [src/server.ts](/D:/Jihan/cortex/src/server.ts): HTTP server and public API
- [src/registry.ts](/D:/Jihan/cortex/src/registry.ts): providers and runtime model registry
- [src/config.ts](/D:/Jihan/cortex/src/config.ts): persisted and environment-backed config
- [src/types.ts](/D:/Jihan/cortex/src/types.ts): shared contracts

### Providers

- [src/providers/base.ts](/D:/Jihan/cortex/src/providers/base.ts): shared browser-provider behavior
- [src/providers/grok.ts](/D:/Jihan/cortex/src/providers/grok.ts): Grok adapter
- [src/providers/gemini.ts](/D:/Jihan/cortex/src/providers/gemini.ts): Gemini adapter
- [src/providers/chatgpt.ts](/D:/Jihan/cortex/src/providers/chatgpt.ts): ChatGPT adapter

### Admin backend

- [src/admin/api.ts](/D:/Jihan/cortex/src/admin/api.ts): admin and user HTTP API
- [src/admin/store.ts](/D:/Jihan/cortex/src/admin/store.ts): SQLite persistence
- [src/admin/auth.ts](/D:/Jihan/cortex/src/admin/auth.ts): password hashing and JWT signing

### Admin frontend

- [admin/src/router/AppRouter.tsx](/D:/Jihan/cortex/admin/src/router/AppRouter.tsx): route map
- [admin/src/lib/api.ts](/D:/Jihan/cortex/admin/src/lib/api.ts): frontend API client
- [admin/src/pages](/D:/Jihan/cortex/admin/src/pages): page-level features

## Roadmap and Known Limitations

Current limitations worth stating clearly in an open-source README:

- only `grok`, `gemini`, and `chatgpt` are currently registered
- `claude` exists in the repo but is not active
- public API surface is intentionally narrow; this is not a full OpenAI API clone
- browser automation can break when providers change their UIs
- token counts are estimated, not authoritative provider billing numbers
- provider availability depends on persisted interactive sessions
- some CLI help text is ahead of current supported operator workflow

If you open-source this publicly, this honesty will save users time and reduce issue churn.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](/D:/Jihan/cortex/CONTRIBUTING.md).

For substantial changes:

- keep changes focused
- update documentation with behavior changes
- validate both backend and admin builds when relevant
- avoid advertising new provider support before it is actually registered and tested end-to-end

## License

Apache-2.0. See [LICENSE](/D:/Jihan/cortex/LICENSE).
