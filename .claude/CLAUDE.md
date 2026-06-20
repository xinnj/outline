# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About this fork

This fork removes two upstream constraints:
- **Sub-path support** — `basePath` is derived from `URL`'s pathname at runtime, scoping routes, auth, cookies, WebSockets, CSP, PWA manifest, and service worker under the prefix.
- **Dynamic CDN** — `CDN_URL` is read at container start, not baked at build time. Assets fall back to `basePath` when unset.

Refer to `README.md` for details and `docs/ARCHITECTURE.md` for the monorepo layout.

## Commands

```bash
# Development
yarn dev:watch                        # Full-stack dev (backend nodemon + Vite HMR)
yarn dev                              # Backend only (all services in one process)
yarn dev:backend                      # Backend with nodemon auto-reload
yarn vite:dev                         # Frontend only (Vite dev server)

# Building
yarn build                            # Full build: clean → vite → i18n → server
yarn build:server                     # Server bundle only (node ./build.js)
yarn vite:build                       # Frontend bundle only

# Unit/integration tests (Vitest, always set TZ=UTC)
yarn test path/to/file.spec.ts        # Run a single test file (preferred)
yarn test:app                         # Frontend tests (--project app)
yarn test:server                      # Backend tests (--project server)
yarn test:shared                      # Shared tests (--project shared-node --project shared-jsdom)
yarn test:watch                       # Watch mode (all projects)

# E2E tests (Playwright)
yarn test:e2e                         # Both projects (root + subpath)
yarn test:e2e:root                    # Root deployment only
yarn test:e2e:subpath                 # Sub-path deployment only
yarn test:e2e:debug                   # Headed mode with PWDEBUG=1

# Linting & formatting
yarn lint                             # Oxlint (type-aware, app server shared plugins)
yarn lint:changed                     # Oxlint only changed files vs main
yarn format                           # Prettier (oxfmt)
yarn format:check                     # Check formatting only (CI)
yarn tsc                              # Full TypeScript type-check

# Database
yarn db:migrate                       # Run pending migrations
yarn db:create-migration              # Generate a migration (interactive)
yarn db:rollback                      # Undo last migration
yarn db:reset                         # Drop, create, migrate (dev only)

# Docker
docker build -f Dockerfile.fork -t outline .
```

## Environment files

`server/utils/environment.ts` loads env files in this order (later overrides earlier):

1. `.env`
2. `.env.${NODE_ENV}` (e.g. `.env.test`)
3. `.env.local` (development only)
4. `.env.${NODE_ENV}.local` — **highest file precedence**
5. Real `process.env` — **ultimate precedence**

| File | Purpose | Git |
|---|---|---|
| `.env` | Base defaults (NODE_ENV, feature flags) | committed |
| `.env.test.local` | Local test overrides (DB URL, credentials) — auto-loaded when `NODE_ENV=test` | ignored |
| `.env.development.local` | Local dev overrides | ignored |
| `.env.remote.local` | Remote CI/E2E server config | ignored |
| `.env.e2e` | E2E base config (`E2E_ROOT_URL`, `E2E_SUBPATH_URL`, etc.) | committed |
| `.env.e2e.local` | E2E local overrides (credentials, per-developer URLs) — auto-loaded by Playwright config | ignored |

## Architecture

### Monorepo

```
app/          React web app (Vite, MobX, Styled Components, React Router)
server/       Koa API server (Sequelize, Redis/Bull, throng, Y.js)
shared/       Shared TypeScript utils, editor (ProseMirror), i18n, styles
plugins/      Plugin system (OIDC, Slack, Google, Linear, Figma, etc.)
public/       Static assets served directly
charts/       Helm chart (this fork)
```

### Server startup flow

`server/index.ts` uses **throng** to fork processes. `env.SERVICES` (comma-separated) controls which services run in each process:

1. **Master** (runs once): checks DB connection, pending migrations, prints env.
2. **Worker** (each fork): creates `http.Server` → installs shared middleware (helmet, rate limiter, `/_health`) → iterates `SERVICES` and calls each service's `init(app, server)`.

Services are **lazy-loaded** (`server/services/index.ts`) — a worker-only process never loads the web service tree. Default services: `web,worker,websockets,collaboration`.

SSL is determined by `getSSLOptions()` (`server/utils/ssl.ts`): it checks `SSL_KEY`/`SSL_CERT` env vars, then falls back to files at `private.key`/`public.cert` in the repo root or `server/config/certs/`. **Do not commit cert files** — `.dockerignore` excludes `*.key`/`*.cert`/`*.pem`.

### API pattern (RPC-style)

Every API call is a `POST` with a named action string. The route defines it once:

```
router.post("documents.info", auth(), validate(T.DocumentsInfoSchema), async (ctx) => { ... })
```

Flow: **validation → auth → authorize → command → presentation**

- Routes live in `server/routes/api/<resource>/<resource>.ts`, schemas alongside in `schema.ts`.
- Business logic is extracted into **command functions** in `server/commands/` — plain async functions taking typed props + context. Not class-based.
- Authorization uses cancan-style policies from `server/policies/`. Call `authorize(user, "read", document)` in the handler.
- Responses use presenters (`server/presenters/`) to shape JSON output: `{ data, policies, pagination }`.
- A `transaction()` middleware wraps Sequelize transactions, available at `ctx.state.transaction`.

### Queues & events

Four Bull queues (all backed by Redis):

| Queue | Purpose | Retries |
|---|---|---|
| `globalEventQueue` | Central event bus — fan-out to processors | Yes |
| `processorEventQueue` | Individual processor execution | Yes (5x) |
| `websocketQueue` | Realtime events (consumed by websockets service only) | No |
| `taskQueue` | One-shot async tasks (imports, cleanup) | Yes (5x) |

- **Processors** (`server/queues/processors/`): extend `BaseProcessor`, declare `static applicableEvents`, implement `perform(event)`. Handle side effects (emails, search indexing, notifications).
- **Tasks** (`server/queues/tasks/`): extend `BaseTask<T>`, implement `perform(props)`. Scheduled via `new SomeTask().schedule(props)`.
- Plugins can register additional processors and tasks.

### Plugin system

`PluginManager` (`server/utils/PluginManager.ts`) is a hook-based registry. Plugins self-register at import time:

```typescript
PluginManager.add({ type: Hook.AuthProvider, value: new OIDCProvider() });
```

`PluginManager.loadPlugins()` globs `plugins/*/server/!(*.test|schema).[jt]s`. Consumers retrieve sorted hooks by type. Plugin API routes mount before built-in routes, allowing overrides.

### Base path (sub-path support)

`env.basePath` is derived from `URL`'s pathname at runtime. For `URL=https://example.com/outline`, `basePath = "/outline"`. Every route mount in `server/services/web.ts` uses `koa-mount` with the base path:

```typescript
app.use(mount(`${basePath}/api`, api));
app.use(mount(`${basePath}/auth`, auth));
```

WebSocket paths: `${basePath}/realtime` (Socket.IO), `${basePath}/collaboration` (Hocuspocus). Cookies, CSRF, OAuth callbacks, CSP headers, and the PWA manifest all incorporate basePath.

The client reads `window.env.BASE_PATH` (injected by the server) and uses `shared/utils/urls.ts` helpers (`assetBaseUrl()`) to resolve assets against CDN, base path, or absolute URL.

### Frontend

React + React Router with MobX stores. Routes are defined in `app/routes/` with async chunk loading via `React.Suspense`. Key directories:

- `app/scenes/` — full-page views (document, collection, settings)
- `app/components/` — reusable components
- `app/stores/` — MobX store singletons (DocumentsStore, CollectionsStore, etc.)
- `app/editor/` — editor-specific components
- `app/menus/` — context menus
- `app/actions/` — reusable navigation/CRUD actions

### Build pipeline

1. **Vite** compiles `app/` + `shared/` into `build/app/`
2. **i18next** extracts translation strings → `shared/i18n/locales/` → copied to `build/shared/i18n/`
3. **`build.js`** (esbuild) bundles `server/` → `build/server/`

The production entry point is `build/server/index.js`. Container images use `Dockerfile.fork` which multistage-builds with `node:24.16.0` → `node:24.16.0-slim`.

## Key conventions

- Do not create new `.md` files (except `.claude/CLAUDE.md` and `docs/`).
- Do not replace smart quotes (`""`, `''`) with straight quotes.
- Never use `any`; avoid `unknown` unless necessary.
- Prefer `interface` over `type` for object shapes.
- Use named exports for components and classes; exported members go at the top of the file.
- Event handlers: `handle` prefix (`handleClick`).
- Colocate `.test.ts` files; don't create new `__tests__` directories.
- Use `yarn` for dependency management. For security resolutions, target specific `name@npm:<range>` descriptors.
- CSS via Styled Components, co-located with the component.

## E2E Testing (Playwright)

### Commands

```bash
yarn test:e2e             # Both projects (chromium-root + chromium-subpath)
yarn test:e2e:root        # Root deployment only
yarn test:e2e:subpath     # Sub-path deployment only
yarn test:e2e:debug       # Headed mode with PWDEBUG=1
```

### Structure

```
e2e/
  playwright.config.ts     # 2 projects, 1 worker, html+list reporters
  helpers/
    auth.ts                # loginViaOIDC(), createAnonymousContext(), getCsrfToken()
    api.ts                 # createDoc(), createCollection(), deleteDoc(), createShare()
    network.ts             # interceptApiCalls(), waitForApiRequest(), waitForApiResponse()
  specs/
    documents.spec.ts      # Document CRUD (4 tests)
    subpath.spec.ts        # Sub-path routing & assets (10 tests)
  COVERAGE.md              # Feature coverage checklist with priorities
```

### How tests authenticate

Tests authenticate via Keycloak OIDC using `loginViaOIDC(browser, basePath)` from `helpers/auth.ts`. It navigates to the app, clicks the OIDC provider, fills Keycloak credentials, submits, then waits for redirect back to Outline. The returned `{ context, page }` has `accessToken` and `csrfToken` cookies set. Credentials come from `.env.e2e` (base) and `.env.e2e.local` (local overrides, git-ignored).

### API helpers pattern

API calls through `page.request.post()` with manually-forwarded browser cookies and `x-csrf-token` header (Playwright's `page.request` doesn't share browser cookies). Example:

```typescript
const doc = await createDoc(page, basePath, { title: "...", collectionId });
```

### Network interception

`interceptApiCalls(page, basePath)` registers `page.route()` for `/api/**` without blocking. Returns `{ requests, assertRequest(method, pathPattern), assertNoRequest(...), clear() }`. For one-shot waits, use `waitForApiRequest(page, method, urlPattern)` or `waitForApiResponse(...)`.

### Two-project setup

Playwright defines two Desktop Chrome projects, both running the same specs:
- **`chromium-root`** — `baseURL` from `E2E_ROOT_URL`, base path `""`
- **`chromium-subpath`** — `baseURL` from `E2E_SUBPATH_URL`, base path from `E2E_SUBPATH`

Tests in `documents.spec.ts` run under both projects (verify APIs work with/without base path). Tests in `subpath.spec.ts` skip unless `chromium-subpath` via `subpathOnly()` guard.

### Environment

Config in `.env.e2e` at the repo root: `E2E_ROOT_URL`, `E2E_SUBPATH_URL`, `E2E_SUBPATH`, `E2E_ADMIN_USERNAME`, `E2E_ADMIN_PASSWORD`. Override with `.env.e2e.local` (git-ignored) for per-developer values. Server-side: `URL` env var must be set for the server to derive `basePath`.

### Coverage tracking

`e2e/COVERAGE.md` is a markdown checklist of ~104 features across 15 areas. Each item has a priority tag (🔴 high / 🟡 medium / 🟢 low) for this fork's small/medium-team, OIDC-primary use case. Update the checklist when adding or removing tests.
