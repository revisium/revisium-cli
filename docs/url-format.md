# URL Format

Revisium CLI uses a special URL format to specify project connections.

## Syntax

```
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
revisium://cloud.revisium.io/myorg/myproject/master:head?token=eyJhbG...

# Local with password auth
revisium://admin:secret@localhost:8080/admin/demo/master
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
revisium://cloud.revisium.io/org/proj/master:head?token=eyJabc...

# Read from specific revision
revisium://cloud.revisium.io/org/proj/master:abc123def?token=eyJabc...

# Write to draft (default)
revisium://cloud.revisium.io/org/proj/master?token=eyJabc...
```

## See Also

- [Authentication](./authentication.md) - Authentication methods
- [Sync Commands](./sync-commands.md) - Using URLs with sync commands
