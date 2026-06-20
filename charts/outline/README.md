# Outline Helm Chart

Deploys [Outline](https://www.getoutline.com/) — a fast, collaborative knowledge base — on Kubernetes.

## Prerequisites

- Kubernetes 1.25+
- Helm 3.12+
- A default StorageClass (for file storage PVC)

## Quick Start

```bash
# Add dependencies
helm dependency update

# Install with in-cluster PostgreSQL and Redis
helm install outline . \
  --set outline.url=https://outline.example.com \
  --set outline.oidc.clientId=<your-client-id> \
  --set outline.oidc.clientSecret=<your-client-secret> \
  --set outline.oidc.authUrl=https://example.com/oauth2/authorize \
  --set outline.oidc.tokenUrl=https://example.com/oauth2/token \
  --set outline.oidc.userinfoUrl=https://example.com/oauth2/userinfo

# Or with external database and Redis
helm install outline . \
  --set outline.url=https://outline.example.com \
  --set outline.oidc.clientId=<your-client-id> \
  --set outline.oidc.clientSecret=<your-client-secret> \
  --set outline.oidc.authUrl=https://example.com/oauth2/authorize \
  --set outline.oidc.tokenUrl=https://example.com/oauth2/token \
  --set outline.oidc.userinfoUrl=https://example.com/oauth2/userinfo \
  --set postgresql.enabled=false \
  --set externalDatabaseUrl=postgres://user:pass@external-db:5432/outline \
  --set redis.enabled=false \
  --set externalRedisUrl=redis://external-redis:6379
```

## Configuration

See `values.yaml` for all available options.

### Required Values

| Parameter | Description |
|-----------|-------------|
| `outline.url` | Public-facing URL of the installation |
| `outline.oidc.clientId` | OIDC client ID |
| `outline.oidc.clientSecret` | OIDC client secret |
| `outline.oidc.authUrl` | OIDC authorization endpoint |
| `outline.oidc.tokenUrl` | OIDC token endpoint |
| `outline.oidc.userinfoUrl` | OIDC userinfo endpoint |

### Dependencies

PostgreSQL and Redis are deployed as chart dependencies by default. To use external instances:

```yaml
postgresql:
  enabled: false
externalDatabaseUrl: "postgres://user:pass@host:5432/outline"

redis:
  enabled: false
externalRedisUrl: "redis://host:6379"
```

### Ingress

Enable ingress and configure your domain:

```yaml
ingress:
  enabled: true
  host: outline.example.com
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  tls:
    - hosts:
        - outline.example.com
      secretName: outline-tls
```

### Extra Environment Variables

Any Outline environment variable not covered by first-class values can be set via `extraEnv`:

```yaml
outline:
  extraEnv:
    RATE_LIMITER_REQUESTS: "1000"
    WEB_CONCURRENCY: "2"
```

## Upgrading

```bash
helm upgrade outline . --reuse-values
```

The chart preserves the `SECRET_KEY` across upgrades. Do not delete the Secret between upgrades — it contains the encryption key for stored data.

## Database Migrations

Migrations run automatically on startup. No manual intervention needed.
