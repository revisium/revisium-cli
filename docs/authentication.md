# Authentication

Revisium CLI supports three authentication methods (mutually exclusive).

## Token Authentication (Recommended)

JWT token from Revisium UI. Best for interactive use.

### Get Your Token

- **Cloud:** <https://cloud.revisium.io/get-mcp-token>
- **Self-hosted:** `https://your-host/get-mcp-token`

### Usage

```bash
# In URL query parameter
revisium://cloud.revisium.io/org/proj?token=<YOUR_TOKEN>

# Via environment variable
export REVISIUM_TOKEN=<YOUR_TOKEN>
revisium schema save --folder ./schemas --url revisium://cloud.revisium.io/org/proj
```

## API Key Authentication

API key for automated access (future feature).

### Usage

```bash
# In URL query parameter
revisium://cloud.revisium.io/org/proj?apikey=ak_xxx...

# Via environment variable
export REVISIUM_API_KEY=ak_xxx...
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

## Interactive Mode

If no credentials are provided, you'll be prompted:

```text
Choose authentication method:
  > Token (copy from https://cloud.revisium.io/get-mcp-token)
    API Key (for automated access)
    Username & Password

Paste token: ****
  OK Authenticated as admin
```

## Environment Variables

### For All Commands (Single Endpoint)

| Variable | Description |
|----------|-------------|
| `REVISIUM_URL` | Default URL (e.g., `revisium://host/org/project/branch`) |
| `REVISIUM_TOKEN` | JWT authentication token |
| `REVISIUM_API_KEY` | API key (for automated access) |
| `REVISIUM_USERNAME` | Username (for password auth) |
| `REVISIUM_PASSWORD` | Password (for password auth) |

### For Sync Commands (Source/Target)

| Variable | Description |
|----------|-------------|
| `REVISIUM_SOURCE_TOKEN` | Source project token |
| `REVISIUM_SOURCE_API_KEY` | Source project API key |
| `REVISIUM_SOURCE_USERNAME` | Source username |
| `REVISIUM_SOURCE_PASSWORD` | Source password |
| `REVISIUM_TARGET_TOKEN` | Target project token |
| `REVISIUM_TARGET_API_KEY` | Target project API key |
| `REVISIUM_TARGET_USERNAME` | Target username |
| `REVISIUM_TARGET_PASSWORD` | Target password |

## Priority

1. **URL auth** (`?token=...` or `user:pass@host`)
2. **Environment variables** (`TOKEN` > `API_KEY` > `USERNAME/PASSWORD`)
3. **Interactive prompts**

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
