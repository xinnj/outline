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

The chart generates `SECRET_KEY` and `UTILS_SECRET` once and preserves them across
upgrades and re-installs. These keys encrypt database columns (user JWT secrets, OAuth
client secrets, integration tokens, etc.) and sign URLs. If they change, stored data
cannot be decrypted and existing sessions and links break.

### Deleting and re-installing

The generated Secret is annotated with `helm.sh/resource-policy: keep`, so
`helm uninstall` leaves it behind. Re-installing with the **same release name** reuses
the existing keys and works against an existing database.

> **Upgrading an existing installation:** a release created before this behavior was
> introduced has a Secret without the `keep` annotation, and `helm upgrade` will not add
> it (the chart skips the Secret when it already exists). Apply the annotation once before
> deleting the release so the key survives:
>
> ```bash
> kubectl annotate secret outline-outline-secret helm.sh/resource-policy=keep
> ```

To fully remove the keys on a
final teardown, delete the Secret manually (named `<release>-outline-secret` by default):

```bash
kubectl delete secret outline-outline-secret
```

### Pinning the keys explicitly

For reproducibility (e.g. GitOps or migrating between clusters), set the keys in your
values instead of letting the chart generate them:

```yaml
outline:
  # SECRET_KEY must be exactly 64 hexadecimal characters
  secretKey: "<64-hex-chars>" # generate with: openssl rand -hex 32
  utilsSecret: "<random-string>"
```

These overrides only apply when the generated Secret does not already exist; changing them
on a live install is ignored so the key is never rotated out from under encrypted data.

### Recovering from a lost key

If the key is lost but the database still holds encrypted data, run
`server/scripts/reset-encrypted-data.ts` to rotate/reset the encrypted tokens. This
invalidates existing sessions and integration credentials.

## Database Migrations

Migrations run automatically on startup. No manual intervention needed.
