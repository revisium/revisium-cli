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
export REVISIUM_SOURCE_TOKEN=<YOUR_TOKEN>
revisium sync all --source revisium://cloud.revisium.io/org/proj
```

## API Key Authentication

API key for automated access (future feature).

### Usage

```bash
# In URL query parameter
revisium://cloud.revisium.io/org/proj?apikey=ak_xxx...

# Via environment variable
export REVISIUM_SOURCE_API_KEY=ak_xxx...
```

## Password Authentication

Username and password credentials.

### Usage

```bash
# In URL
revisium://admin:secret@cloud.revisium.io/org/proj

# Via environment variables
export REVISIUM_SOURCE_USERNAME=admin
export REVISIUM_SOURCE_PASSWORD=secret
```

## Interactive Mode

If no credentials are provided, you'll be prompted:

```text
[source] Choose authentication method:
  ❯ Token (copy from https://cloud.revisium.io/get-mcp-token)
    API Key (for automated access)
    Username & Password

[source] Paste token: ****
  ✓ Authenticated as admin
```

## Environment Variables

### For Sync Commands

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

### For Other Commands

| Variable | Description |
|----------|-------------|
| `REVISIUM_USERNAME` | Username |
| `REVISIUM_PASSWORD` | Password |

## Priority

1. **URL auth** (`?token=...` or `user:pass@host`)
2. **Environment variables** (`TOKEN` > `API_KEY` > `USERNAME/PASSWORD`)
3. **Interactive prompts**

## Validation

You cannot mix authentication methods:

```bash
# ❌ Cannot use both credentials and token
revisium://admin:pass@host/org/proj?token=xxx

# ❌ Cannot use both token and apikey
revisium://host/org/proj?token=xxx&apikey=yyy
```

## Examples

### CI/CD with Token

```yaml
# GitHub Actions
env:
  REVISIUM_SOURCE_TOKEN: ${{ secrets.REVISIUM_TOKEN }}
```

### Automation with Password

```bash
export REVISIUM_SOURCE_USERNAME=deploy-user
export REVISIUM_SOURCE_PASSWORD=$DEPLOY_PASSWORD
revisium sync all --source revisium://cloud.revisium.io/org/proj
```

## See Also

- [URL Format](./url-format.md) - URL syntax
- [Configuration](./configuration.md) - Environment variables
