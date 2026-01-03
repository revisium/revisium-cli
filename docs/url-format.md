# URL Format

Revisium CLI uses a special URL format to specify project connections.

## Syntax

```text
revisium://[user:password@]host[:port]/organization/project/branch[:revision][?params]
```

## URL Parts

| Part | Description | Required | Default |
|------|-------------|----------|---------|
| `host` | Server hostname | Yes | - |
| `port` | Server port | No | 443 (https) / 8080 (http) |
| `organization` | Organization name | No | Prompted |
| `project` | Project name | No | Prompted |
| `branch` | Branch name | No | `master` |
| `revision` | Revision target | No | `draft` |

## Query Parameters (Authentication)

| Parameter | Description |
|-----------|-------------|
| `token` | JWT authentication token |
| `apikey` | API key (for automated access) |

## Revision Values

| Value | Description |
|-------|-------------|
| `draft` | Draft (uncommitted) revision - **default** |
| `head` | Head (last committed) revision |
| `<revision-id>` | Specific revision by ID |

**Note:** Target revision must always be `draft` (sync writes to draft). Source can be any revision.

## Protocol Detection

| Host | Protocol | Default Port |
|------|----------|--------------|
| `localhost` | http | 8080 |
| `127.0.0.1` | http | 8080 |
| Other hosts | https | 443 |

## Authentication Examples

### Token Authentication (Recommended)

Token in URL query parameter:

```bash
revisium://cloud.revisium.io/myorg/myproject/master?token=eyJhbGciOiJIUzI1NiIs...
```

Token via environment variable:

```bash
export REVISIUM_TOKEN=eyJhbGciOiJIUzI1NiIs...
revisium migrate apply --file ./migrations.json \
  --url revisium://cloud.revisium.io/myorg/myproject/master
```

Get your token:
- **Cloud:** https://cloud.revisium.io/get-mcp-token
- **Self-hosted:** https://your-host/get-mcp-token

### API Key Authentication

API key in URL query parameter:

```bash
revisium://cloud.revisium.io/myorg/myproject/master?apikey=ak_xxxxxxxxxxxxx
```

API key via environment variable:

```bash
export REVISIUM_API_KEY=ak_xxxxxxxxxxxxx
revisium migrate apply --file ./migrations.json \
  --url revisium://cloud.revisium.io/myorg/myproject/master
```

### Password Authentication

Credentials in URL:

```bash
revisium://admin:secret@cloud.revisium.io/myorg/myproject/master
```

Credentials via environment variables:

```bash
export REVISIUM_USERNAME=admin
export REVISIUM_PASSWORD=secret
revisium migrate apply --file ./migrations.json \
  --url revisium://cloud.revisium.io/myorg/myproject/master
```

### CI/CD (Username/Password via Environment)

```bash
# Set credentials in CI environment
export REVISIUM_USERNAME=$REVISIUM_USERNAME
export REVISIUM_PASSWORD=$REVISIUM_PASSWORD

# URL without credentials
revisium migrate apply --file ./migrations.json \
  --url revisium://cloud.revisium.io/myorg/myproject/master --commit
```

## URL Examples

### Full URL with Token

```bash
# Cloud with token auth
revisium://cloud.revisium.io/myorg/myproject/master:head?token=<YOUR_TOKEN>

# Local development
revisium://localhost:8080/admin/demo/master?token=<YOUR_TOKEN>
```

### Partial URL (missing parts will be prompted)

```bash
# No auth - will prompt
revisium://cloud.revisium.io/org/proj

# No branch - defaults to master
revisium://cloud.revisium.io/org/proj

# Just host - will prompt for everything else
revisium://cloud.revisium.io
```

### With Revision

```bash
# Read from head revision
revisium://cloud.revisium.io/org/proj/master:head?token=<YOUR_TOKEN>

# Read from specific revision
revisium://cloud.revisium.io/org/proj/master:abc123def?token=<YOUR_TOKEN>

# Write to draft (default)
revisium://cloud.revisium.io/org/proj/master?token=<YOUR_TOKEN>
```

## Using with Commands

All commands support the `--url` option:

```bash
# Schema commands
revisium schema save --folder ./schemas --url revisium://host/org/proj?token=xxx

# Migration commands
revisium migrate apply --file migrations.json --url revisium://host/org/proj?token=xxx

# Rows commands
revisium rows upload --folder ./data --url revisium://host/org/proj?token=xxx
```

### Default URL via Environment

Set `REVISIUM_URL` to avoid repeating the URL:

```bash
export REVISIUM_URL=revisium://cloud.revisium.io/myorg/myproject/main
export REVISIUM_TOKEN=your_token

# Now you can omit --url
revisium schema save --folder ./schemas
revisium migrate apply --file migrations.json
```

## Sync Commands (Source/Target)

Sync commands use separate URLs for source and target:

```bash
revisium sync all \
  --source revisium://source.example.com/org/proj/master:head?token=xxx \
  --target revisium://target.example.com/org/proj/master?token=yyy
```

With environment variables:

```bash
export REVISIUM_SOURCE_TOKEN=source_token
export REVISIUM_TARGET_TOKEN=target_token

revisium sync all \
  --source revisium://source.example.com/org/proj/master:head \
  --target revisium://target.example.com/org/proj/master
```

## See Also

- [Authentication](./authentication.md) - Authentication methods in detail
- [Configuration](./configuration.md) - Environment variables
- [Sync Commands](./sync-commands.md) - Using URLs with sync commands
