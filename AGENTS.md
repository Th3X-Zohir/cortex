# AGENTS.md

This file helps AI coding agents become productive quickly in this repository.

## Scope

- Applies to the whole repository.
- Keep changes focused. Do not refactor unrelated areas.
- Prefer linking existing docs over copying large documentation blocks.

Main references:

- [README.md](README.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)

## Fast Start

Backend setup and validation:

~~~bash
npm install
npm run build
npm run typecheck
npm test
~~~

Admin app setup and validation:

~~~bash
npm --prefix admin install
npm --prefix admin run build
~~~

Development workflow (two terminals):

~~~bash
# Terminal 1 (backend)
npm run build
npm run dev

# Terminal 2 (admin UI)
npm --prefix admin run dev
~~~

Notes:

- The backend dev script watches `dist/cli.js`, so build first.
- Admin dev server runs on port 5173 and proxies `/api` and `/ws` to backend port 31338.
- Docker compose exposes the stack on host port 31339 (nginx proxy).

## Architecture Boundaries

Core backend:

- [src/server.ts](src/server.ts): HTTP entrypoints, OpenAI-compatible routes, CORS, auth checks, admin static hosting.
- [src/registry.ts](src/registry.ts): provider lifecycle, model registry, session restore/keepalive.
- [src/config.ts](src/config.ts): config defaults and environment overrides.
- [src/types.ts](src/types.ts): shared contracts and provider interfaces.

Provider implementation:

- [src/providers/base.ts](src/providers/base.ts): shared Playwright provider behavior.
- [src/providers/grok.ts](src/providers/grok.ts), [src/providers/gemini.ts](src/providers/gemini.ts), [src/providers/chatgpt.ts](src/providers/chatgpt.ts): concrete web providers.
- `src/providers/claude.ts`, `src/providers/claude-api.ts`, `src/providers/gemini-api.ts`, `src/providers/codex-api.ts`, `src/providers/api-base.ts`: exist but are **not registered** in the active provider registry.

Admin backend:

- [src/admin/api.ts](src/admin/api.ts): authenticated admin API surface and permissions.
- [src/admin/store.ts](src/admin/store.ts): SQLite persistence for admins, keys, logs, and audit data.
- [src/admin/auth.ts](src/admin/auth.ts): JWT and password handling.

Admin frontend:

- [admin/src/router/AppRouter.tsx](admin/src/router/AppRouter.tsx): route map and protected pages.
- [admin/src/lib/api.ts](admin/src/lib/api.ts): API client and token plumbing.
- [admin/src/pages](admin/src/pages): page-level features.

## Conventions That Matter

- TypeScript strict mode is enabled for both backend and admin.
- Root package uses ESM and Node 20+.
- Build uses esbuild for bundling (not tsc emit); `tsc --noEmit` is typecheck only.
- Preserve OpenAI-compatible response shapes for /v1 endpoints.
- Keep provider-specific behavior inside provider files; avoid leaking provider logic into server routing.
- No dedicated lint config is present. Match existing local style and naming.
- Admin frontend uses Vite + React + Tailwind + Radix UI with `@` path alias.

## Expected Validation Before Finishing

- Run `npm run typecheck` for backend changes.
- Run `npm test` when behavior changes.
- Run `npm run build` for backend entrypoint or packaging changes.
- Run `npm --prefix admin run build` for admin UI changes.

If an endpoint contract changes, validate with:

- [README.md](README.md) API examples
- [run-tests.ps1](run-tests.ps1) smoke request script (Docker mapped port 31339)

## High-Risk Pitfalls

- API key enforcement is on by default (`CORTEX_REQUIRE_API_KEY` is true unless explicitly set to `false`).
- `/v1/login/:provider` and `/v1/logout/:provider` are intentionally blocked with 403; provider login/logout is managed in admin routes.
- Session restore relies on persistent profiles under `~/.cortex/profiles`.
- Docker ingress uses nginx in [docker-compose.yml](docker-compose.yml): host 31339 maps to nginx:80, then proxies to cortex:31338 and noVNC routes on cortex:6080.
- Headless browser container startup depends on [docker-entrypoint.sh](docker-entrypoint.sh) cleanup and Xvfb/noVNC boot.
- Default bootstrap admin credentials are `admin`/`admin` — change immediately.
- Config lives in `~/.cortex/config.json`; corrupt files are silently ignored.
- Only `grok`, `gemini`, and `chatgpt` are active registered providers. Do not present unregistered providers as live.

## Change Patterns

When adding or modifying providers:

1. Follow [src/providers/base.ts](src/providers/base.ts) conventions.
2. Implement provider class in src/providers.
3. Register provider and models in [src/registry.ts](src/registry.ts).
4. Ensure status and admin model listings remain consistent via [src/admin/api.ts](src/admin/api.ts).

When changing auth or admin permissions:

1. Update role/permission behavior in [src/admin/api.ts](src/admin/api.ts).
2. Keep token and password rules aligned with [src/admin/auth.ts](src/admin/auth.ts).
3. Check downstream UI expectations in [admin/src/hooks/useAuth.ts](admin/src/hooks/useAuth.ts) and related admin pages.


<!-- lean-ctx -->
## lean-ctx

Prefer lean-ctx MCP tools over native equivalents for token savings.
Full rules: @LEAN-CTX.md
<!-- /lean-ctx -->

