# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
npm install
npm run build         # tsc type-check + esbuild bundle → dist/
npm run typecheck     # type-check only (no emit)
npm test              # vitest run
npm run dev           # watch dist/cli.js (requires a prior build)
```

### Admin UI (separate Vite app in `admin/`)
```bash
npm --prefix admin install
npm --prefix admin run dev    # dev server on :5173, proxies API to :31338
npm --prefix admin run build  # tsc + vite build
```

### Running
```bash
node dist/cli.js start --port=31338
node dist/cli.js login <grok|claude|gemini|chatgpt>
```

## Architecture

cortex is a self-hosted HTTP proxy that wraps AI web UIs (and optionally real SDKs) as an OpenAI-compatible API. It runs on port **31338** by default.

### Two provider families

| Family | Base class | Auth mechanism | Examples |
|---|---|---|---|
| **Web / Playwright** | `src/providers/base.ts` | Persistent Chromium profile under `~/.cortex/profiles/` | `grok`, `claude`, `gemini`, `chatgpt` |
| **API / SDK** | `src/providers/api-base.ts` | API key from config or env var | `claude-api`, `gemini-api`, `codex-api` |

All providers implement the `ProviderAdapter` interface in `src/types.ts` (`chat`, `chatStream`, `checkSession`, `ensureConnected`, `login`, `logout`, `restoreSession`).

### Request flow

```
HTTP → BridgeServer (src/server.ts)
         ├── /v1/chat/completions  → ProviderRegistry.providerForModel()
         │                              → provider.chat() / provider.chatStream()
         ├── /v1/models, /v1/status, /health
         └── /admin/*              → admin REST API (src/admin/api.ts)
                                        → AdminStore (SQLite via better-sqlite3)
```

### Key files

| File | Role |
|---|---|
| `src/server.ts` | HTTP entrypoint, OpenAI-compatible routes, auth enforcement, admin static hosting |
| `src/registry.ts` | Provider lifecycle, model registry, session restore/keepalive on startup |
| `src/types.ts` | All shared contracts — `ProviderAdapter`, `ChatRequest`, `BridgeConfig` |
| `src/config.ts` | Config defaults (`~/.cortex/config.json`) and env var overrides (`CORTEX_*`) |
| `src/admin/store.ts` | SQLite persistence for admins, API keys, request logs, audit trail |
| `src/admin/api.ts` | Authenticated admin REST surface and role/permission enforcement |
| `src/admin/auth.ts` | JWT issuance and password hashing |
| `admin/` | React + Vite admin dashboard (Radix UI, Tailwind, Recharts) |

## Conventions

- **TypeScript strict mode** is on for both root and `admin/`.
- Root package is **ESM** (`"type": "module"`) targeting Node ≥ 20.
- **OpenAI response shapes** must be preserved on all `/v1` endpoints.
- Provider-specific logic stays inside provider files — do not leak it into `server.ts`.
- No dedicated lint config; match local style.

## Critical behaviours to preserve

- `CORTEX_REQUIRE_API_KEY` defaults to `true` — admin API key enforcement is on unless explicitly disabled.
- `/v1/login/:provider` and `/v1/logout/:provider` return **403** by design; provider auth is managed through admin routes only.
- Session restore on startup iterates all registered providers; `ProviderRegistry.restoreSessions()` runs before the server accepts traffic.
- Auto-fallback provider selection (used when a provider is blocked/rate-limited) is restricted to `gemini` by current logic in `BridgeServer._selectAutoFallbackProvider`.
- Docker ingress: host **31339** → nginx → cortex **31338** + noVNC **6080**. The `docker-entrypoint.sh` bootstraps Xvfb before starting the server.

## Adding a new provider

1. Extend `BaseProvider` (web) or `ApiBaseProvider` (SDK/API) in `src/providers/`.
2. Add the provider name to the `ProviderName` union in `src/types.ts`.
3. Register the provider and its models in `src/registry.ts`.
4. If it needs an API key, add the key field to `ApiKeyConfig` in `src/types.ts` and handle it in `src/providers/api-base.ts`.
5. Verify that `GET /v1/models` and `GET /v1/status` list it correctly via `src/admin/api.ts`.
