# Authentication

Revisium CLI supports three authentication methods for authenticated instances. Workspace contexts can also opt into explicit no-auth mode for local standalone demos.

## Token Authentication (Recommended)

JWT token from Revisium UI. Best for interactive use.

### Get Your Token

- **Cloud:** <https://cloud.revisium.io/get-token>
- **Self-hosted:** `https://your-host/get-token`

### Usage

```bash
# In URL query parameter
revisium://cloud.revisium.io/org/proj?token=<YOUR_TOKEN>

# Via environment variable
export REVISIUM_TOKEN=<YOUR_TOKEN>
revisium schema save --folder ./schemas --url revisium://cloud.revisium.io/org/proj
```

## API Key Authentication

API key for automated and programmatic access. Keys use the `rev_` prefix and are sent via the `X-Api-Key` header (recommended over Bearer for API keys).

### Saved API Key

```bash
revisium instance add cloud --url revisium://cloud.revisium.io --auth stored
revisium context create dictionary-cloud \
  --url revisium://cloud.revisium.io/org/proj/master \
  --credential default
revisium context use dictionary-cloud

revisium auth login --instance cloud --api-key
revisium schema save --folder ./schemas
```

`auth login --api-key` prompts with hidden input and stores the key in the operating system credential store. The workspace config stores only the instance, context, and credential name. To script setup, use stdin:

```bash
printf '%s\n' "$REVISIUM_API_KEY" | \
  revisium auth login --instance cloud --credential default --api-key-stdin
```

Use `auth status` to check whether a credential exists and `auth logout` to delete it:

```bash
revisium auth status --instance cloud
revisium auth logout --instance cloud
```

### One-Off Usage

```bash
# In URL query parameter, useful for compatibility but avoid shell history leaks
revisium://cloud.revisium.io/org/proj?apikey=rev_xxxxxxxxxxxxxxxxxxxx

# Via environment variable, useful for CI
export REVISIUM_API_KEY=rev_xxxxxxxxxxxxxxxxxxxx
```

## Password Authentication

Username and password credentials.

### Usage

```bash
# In URL
revisium://admin:secret@cloud.revisium.io/org/proj

# Via environment variables
export REVISIUM_USERNAME=admin
export REVISIUM_PASSWORD=secret
```

## No Auth For Local Standalone

Use workspace config when a standalone instance runs with auth disabled:

```bash
revisium instance add local --url revisium://localhost:9222 --auth none
revisium context create dictionary-local \
  --url revisium://localhost:9222/admin/dictionary/master
revisium context use dictionary-local
```

`authMode: "none"` sends no auth headers and bypasses prompts. Do not use it for cloud or shared authenticated instances.

## Interactive Mode

If no credentials are provided, you'll be prompted:

```text
Choose authentication method:
  > Token (copy from https://cloud.revisium.io/get-token)
    API Key (for automated access)
    Username & Password

Paste token: ****
  OK Authenticated as admin
```

## Environment Variables

### For All Commands (Single Endpoint)

| Variable            | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `REVISIUM_URL`      | Default URL (e.g., `revisium://host/org/project/branch`) |
| `REVISIUM_TOKEN`    | JWT authentication token                                 |
| `REVISIUM_API_KEY`  | API key (for automated access)                           |
| `REVISIUM_USERNAME` | Username (for password auth)                             |
| `REVISIUM_PASSWORD` | Password (for password auth)                             |

### For Sync Commands (Source/Target)

| Variable                   | Description            |
| -------------------------- | ---------------------- |
| `REVISIUM_SOURCE_TOKEN`    | Source project token   |
| `REVISIUM_SOURCE_API_KEY`  | Source project API key |
| `REVISIUM_SOURCE_USERNAME` | Source username        |
| `REVISIUM_SOURCE_PASSWORD` | Source password        |
| `REVISIUM_TARGET_TOKEN`    | Target project token   |
| `REVISIUM_TARGET_API_KEY`  | Target project API key |
| `REVISIUM_TARGET_USERNAME` | Target username        |
| `REVISIUM_TARGET_PASSWORD` | Target password        |

## Priority

1. **URL auth** (`?token=...`, `?apikey=...`, or `user:pass@host`)
2. **Environment variables** (`TOKEN` > `API_KEY` > `USERNAME/PASSWORD`)
3. **Workspace no-auth mode** (`authMode: "none"`)
4. **Saved workspace credential** (`authMode: "stored"`)
5. **Interactive prompts**

## Validation

You cannot mix authentication methods:

```bash
# Cannot use both credentials and token
revisium://admin:pass@host/org/proj?token=xxx

# Cannot use both token and apikey
revisium://host/org/proj?token=xxx&apikey=yyy
```

## Examples

### CI/CD with Token

```yaml
# GitHub Actions
env:
  REVISIUM_TOKEN: ${{ secrets.REVISIUM_TOKEN }}
  REVISIUM_URL: revisium://cloud.revisium.io/myorg/myproject/main
```

### Schema Export

```bash
export REVISIUM_TOKEN=$YOUR_TOKEN
revisium schema save --folder ./schemas --url revisium://cloud.revisium.io/org/proj
```

### Apply Migrations

```bash
export REVISIUM_URL=revisium://cloud.revisium.io/org/proj/main
export REVISIUM_TOKEN=$YOUR_TOKEN
revisium migrate apply --file migrations.json --commit
```

### Automation with Password

```bash
export REVISIUM_USERNAME=deploy-user
export REVISIUM_PASSWORD=$DEPLOY_PASSWORD
revisium rows upload --folder ./data --url revisium://cloud.revisium.io/org/proj
```

### Sync Between Projects

```bash
export REVISIUM_SOURCE_TOKEN=$SOURCE_TOKEN
export REVISIUM_TARGET_TOKEN=$TARGET_TOKEN
revisium sync all \
  --source revisium://cloud.revisium.io/org1/proj1 \
  --target revisium://cloud.revisium.io/org2/proj2
```

## See Also

- [URL Format](./url-format.md) - URL syntax
- [Configuration](./configuration.md) - Environment variables
- [Workspace Config](./workspace-config.md) - workspace instances and contexts
