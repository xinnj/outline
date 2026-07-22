# Outline (Fork)

This is a fork of [outline/outline](https://github.com/outline/outline) — the fast, collaborative knowledge base built with React and Node.js. See the [original upstream README](README_UPSTREAM.md) for core documentation, architecture, and contribution guidelines.

## Why this fork exists

Upstream Outline has two limitations for self-hosters:

- **No sub-path support.** You cannot serve Outline from a URL like `https://example.com/outline`. The app assumes it runs at the domain root and hardcodes absolute paths (`/`, `/api`, `/auth`) throughout the codebase.
- **CDN baked at build time.** The `CDN_URL` is embedded into the JavaScript bundle during the Vite build, so changing CDNs (or adding/removing one) requires rebuilding the Docker image.

This fork removes both constraints — the same container image can run at any sub-path and with any CDN, configured entirely at startup via environment variables.

## Main changes

### Sub-path support

Set `URL` to a prefixed URL (e.g. `https://app.example.com/outline`) and the `basePath` is derived automatically from its path component. Everything scopes itself under that prefix at runtime:

- **Routes** — all server and client routes are prefixed with the base path
- **Authentication** — OAuth callback URLs, OIDC discovery endpoints, and MCP authorization server metadata include the base path
- **Cookies** — CSRF tokens and session cookies set `path=<basePath>` so they are scoped correctly
- **WebSockets** — collaboration and websocket connection paths include the base path
- **CSP headers** — `Content-Security-Policy` uses the origin (without path) for asset sources, and `strict-dynamic` for scripts so nonced inline scripts can load sub-path assets
- **PWA manifest** — `start_url` and icon paths use relative `../` notation so the install scope works under any prefix
- **Service worker** — precache URLs stay relative when no CDN is set, resolving against the worker's own location under the base path

The base path is surfaced to the client as `window.env.BASE_PATH` and used by the API client, asset URL helpers, and Vite's `renderBuiltUrl` runtime hook.

### Dynamic CDN

The `CDN_URL` environment variable is read at container start, not at build time. Assets (JS bundles, CSS, fonts, images) resolve against the CDN when set, or fall back to the base path. Switching CDNs no longer requires rebuilding the image.

### OIDC admin role mapping

Two new OIDC environment variables provide automatic admin role assignment based on identity provider claims:

- **`OIDC_ADMIN_CLAIM`** — claim path in the OIDC userinfo/id_token response (supports dot-notation for nested paths, e.g. `realm_access.roles`)
- **`OIDC_ADMIN_CLAIM_VALUE`** — the value to match against the claim. If the claim is an array, the user gets Admin if the array contains this value. If it's a string, it must match exactly.

When both are set, role mapping runs on every login: users who match are promoted to Admin, users who stop matching are demoted. When unset, role assignment follows the existing team-level default.

### Helm chart

A production-ready Helm chart is included at `charts/outline/` with:

- Bundled PostgreSQL (Bitnami 16.x) and Redis (Bitnami 21.x) sub-charts
- Auto-generated `SECRET_KEY` and `UTILS_SECRET` preserved across upgrades
- Automatic database migrations on startup
- Configurable ingress, persistence, resources, SMTP, and OIDC

## Usage

### Docker

```bash
docker run \
  -e URL=https://app.example.com/outline \
  -e CDN_URL=https://cdn.example.com \
  -e DATABASE_URL=postgres://user:pass@host:5432/outline \
  -e REDIS_URL=redis://host:6379 \
  -e SECRET_KEY=<random-secret> \
  -e UTILS_SECRET=<random-secret> \
  -e OIDC_CLIENT_ID=... \
  -e OIDC_CLIENT_SECRET=... \
  -e OIDC_AUTH_URI=https://provider.example.com/oauth2/authorize \
  -e OIDC_TOKEN_URI=https://provider.example.com/oauth2/token \
  -e OIDC_USERINFO_URI=https://provider.example.com/oauth2/userinfo \
  xinnj/outline:latest
```

When `URL` is `https://app.example.com/outline`, the app is served at `/outline/`. Set `URL` to `https://app.example.com` (no path) to serve at the domain root.

### Kubernetes (Helm)

```bash
helm dependency update charts/outline
helm install outline charts/outline \
  --set outline.url=https://app.example.com/outline \
  --set outline.oidc.clientId=<client-id> \
  --set outline.oidc.clientSecret=<client-secret> \
  --set outline.oidc.authUrl=https://provider.example.com/oauth2/authorize \
  --set outline.oidc.tokenUrl=https://provider.example.com/oauth2/token \
  --set outline.oidc.userinfoUrl=https://provider.example.com/oauth2/userinfo
```

## Helm chart values

### Global

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `nameOverride` | string | `""` | Override the chart name used in resource names |
| `fullnameOverride` | string | `""` | Override the fully-qualified app name |

### Outline (`outline.*`)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `url` | string | `""` | **Required.** Public URL of the installation. Include a path (e.g. `https://host/outline`) to serve under a sub-path. |
| `port` | int | `3000` | Port the server listens on |
| `forceHttps` | bool | `false` | Redirect HTTP requests to HTTPS |
| `cdnUrl` | string | `""` | CDN URL for static assets. Read at runtime — no rebuild needed to change. |
| `oidc.clientId` | string | `""` | **Required.** OIDC client ID |
| `oidc.clientSecret` | string | `""` | **Required.** OIDC client secret (stored in a Kubernetes Secret, not plaintext ConfigMap) |
| `oidc.issuerUrl` | string | `""` | OIDC issuer URL for auto-discovery via `.well-known/openid-configuration`. When set, `authUrl`, `tokenUrl`, and `userinfoUrl` are auto-discovered and can be omitted. |
| `oidc.logoutUrl` | string | `""` | OIDC RP-initiated logout endpoint. When set, logging out of Outline also ends the provider session. |
| `oidc.authUrl` | string | `""` | **Required if no `issuerUrl`.** OIDC authorization endpoint |
| `oidc.tokenUrl` | string | `""` | **Required if no `issuerUrl`.** OIDC token endpoint |
| `oidc.userinfoUrl` | string | `""` | **Required if no `issuerUrl`.** OIDC userinfo endpoint |
| `oidc.displayName` | string | `"SSO"` | Login button label for this OIDC provider |
| `oidc.scopes` | string | `"openid profile email"` | OIDC scopes to request |
| `oidc.adminClaim` | string | `"groups"` | Claim path for admin role mapping. Supports dot-notation (e.g. `realm_access.roles`). Ignored when `adminClaimValue` is empty. |
| `oidc.adminClaimValue` | string | `"outline_admin"` | Value that the claim must contain (array) or match (string) to grant Admin. Ignored when `adminClaim` is empty. |
| `defaultUserRole` | string | `"member"` | Default role for new SSO users (`viewer` or `member`). Overrides the team-level setting. |
| `rateLimiter.enabled` | string | `"true"` | Enable API rate limiting |
| `rateLimiter.requests` | string | `"1000"` | Maximum requests per duration window |
| `rateLimiter.durationWindow` | string | `"60"` | Rate limit window in seconds |
| `pgsslmode` | string | `"disable"` | PostgreSQL SSL mode. Set to `"require"` for SSL connections. |
| `smtp.enabled` | bool | `false` | Enable SMTP for email notifications and invites |
| `smtp.host` | string | `""` | SMTP server hostname |
| `smtp.port` | int | `587` | SMTP server port |
| `smtp.username` | string | `""` | SMTP username |
| `smtp.password` | string | `""` | SMTP password (stored in a Kubernetes Secret) |
| `smtp.fromEmail` | string | `""` | From address for outgoing emails |
| `smtp.replyEmail` | string | `""` | Reply-to address for outgoing emails |
| `smtp.secure` | bool | `true` | Use TLS for the SMTP connection |
| `extraEnv` | object | `{}` | Arbitrary Outline environment variables. See the [upstream env var docs](https://docs.getoutline.com/s/hosting/doc/environment-variables) for available options (e.g. `RATE_LIMITER_REQUESTS`, `WEB_CONCURRENCY`). |

### Image (`image.*`)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `repository` | string | `xinnj/outline` | Container image repository |
| `tag` | string | `""` | Image tag. Defaults to the chart `appVersion`. |
| `pullPolicy` | string | `IfNotPresent` | Kubernetes image pull policy |

### Persistence (`persistence.*`)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | bool | `false` | Create a PVC for uploaded file storage |
| `size` | string | `10Gi` | Requested volume size |
| `accessMode` | string | `ReadWriteOnce` | PVC access mode |
| `storageClassName` | string | `""` | StorageClass to use. Empty uses the cluster default. |

### Service (`service.*`)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `type` | string | `ClusterIP` | Kubernetes Service type |
| `port` | int | `80` | Service port |

### Ingress (`ingress.*`)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | bool | `false` | Create an Ingress resource |
| `host` | string | `""` | **Required if enabled.** Hostname for the ingress rule. |
| `annotations` | object | `{}` | Ingress annotations (e.g. for cert-manager) |
| `tls` | list | `[]` | TLS configuration. Example: `[{hosts: [outline.example.com], secretName: outline-tls}]` |

### Resources (`resources.*`)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `requests.memory` | string | `512Mi` | Memory request |
| `requests.cpu` | string | `500m` | CPU request |
| `limits.memory` | string | `1Gi` | Memory limit |
| `limits.cpu` | string | `1000m` | CPU limit |

### PostgreSQL dependency (`postgresql.*`)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | bool | `true` | Deploy the bundled Bitnami PostgreSQL chart |
| `auth.database` | string | `outline` | Database name to create |
| `auth.username` | string | `outline` | Database user to create |
| `auth.password` | string | `""` | Database password. If empty, Bitnami generates one automatically. |

### Redis dependency (`redis.*`)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | bool | `true` | Deploy the bundled Bitnami Redis chart |
| `architecture` | string | `standalone` | Redis deployment mode |
| `auth.enabled` | bool | `false` | Enable Redis AUTH |

### External connections

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `externalDatabaseUrl` | string | `""` | **Required when `postgresql.enabled=false`.** PostgreSQL connection string (e.g. `postgres://user:pass@host:5432/outline`). |
| `externalRedisUrl` | string | `""` | **Required when `redis.enabled=false`.** Redis connection string (e.g. `redis://host:6379`). |

## Important notes

- `SECRET_KEY` and `UTILS_SECRET` are auto-generated on first install and preserved across upgrades via `lookup` — do not delete the Secret between upgrades, it contains the encryption key for your stored data.
- Database migrations run automatically on startup. No manual intervention needed.
- The chart uses Bitnami PostgreSQL 16.x and Redis 21.x as sub-chart dependencies. See their upstream documentation for full configuration options.
- This fork tracks upstream Outline. The sub-path, dynamic CDN, and OIDC admin role mapping changes are the only intentional divergences. For issues unrelated to these features, please report them upstream at [outline/outline](https://github.com/outline/outline).
