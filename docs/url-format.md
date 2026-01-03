# URL Format

Revisium CLI uses a special URL format to specify project connections.

## Syntax

```text
revisium://[auth@]host[:port]/organization/project/branch[:revision][?params]
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
| Other hosts | https (prompted) | 443 |

## Examples

### Full URL

```bash
# Cloud with token auth
revisium://cloud.revisium.io/myorg/myproject/master:head?token=<YOUR_TOKEN>

# Local with password auth (not recommended, use token instead)
revisium://localhost:8080/admin/demo/master?token=<YOUR_TOKEN>
```

### Partial URL (missing parts will be prompted)

```bash
# No auth - will prompt
revisium://cloud.revisium.io/org/proj

# No branch - defaults to master
revisium://admin@cloud.revisium.io/org/proj

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
revisium schema save --folder ./schemas --url revisium://host/org/proj

# Migration commands
revisium migrate apply --file migrations.json --url revisium://host/org/proj

# Rows commands
revisium rows upload --folder ./data --url revisium://host/org/proj

# Patches commands
revisium patches apply --input ./patches --url revisium://host/org/proj
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

## See Also

- [Authentication](./authentication.md) - Authentication methods
- [Sync Commands](./sync-commands.md) - Using URLs with sync commands
