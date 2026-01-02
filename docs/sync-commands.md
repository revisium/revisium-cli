# Sync Commands

Commands for synchronizing between two Revisium projects.

## Use Cases

- **Content Migration** - Move content between environments (staging → production)
- **Schema Replication** - Keep schemas in sync across instances
- **Backup/Restore** - Replicate data to backup instances
- **Multi-tenant Sync** - Synchronize content across tenant projects

## sync schema

Synchronize schema migrations from source to target.

```bash
revisium sync schema --source <url> --target <url> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --source <url>` | Source project URL | Required |
| `-t, --target <url>` | Target project URL | Required |
| `-c, --commit` | Create revision after sync | false |
| `--dry-run` | Preview without applying | false |

### Examples

```bash
# Sync schema
revisium sync schema \
  --source revisium://cloud.revisium.io/org/proj/master:head?token=xxx \
  --target revisium://localhost:8080/org/proj?token=yyy

# Dry run
revisium sync schema \
  --source revisium://cloud.revisium.io/org/proj \
  --target revisium://localhost:8080/org/proj \
  --dry-run

# Sync and commit
revisium sync schema \
  --source revisium://source.example.com/org/proj \
  --target revisium://target.example.com/org/proj \
  --commit
```

### What It Does

1. Connects to source and target projects
2. Fetches migrations from source revision
3. Applies migrations to target draft revision
4. Optionally commits changes

## sync data

Synchronize table rows from source to target.

```bash
revisium sync data --source <url> --target <url> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --source <url>` | Source project URL | Required |
| `-t, --target <url>` | Target project URL | Required |
| `--tables <list>` | Comma-separated tables | All tables |
| `--batch-size <n>` | Rows per batch | 100 |
| `-c, --commit` | Create revision after sync | false |
| `--dry-run` | Preview without applying | false |

### Examples

```bash
# Sync all tables
revisium sync data \
  --source revisium://cloud.revisium.io/org/proj:head?token=xxx \
  --target revisium://localhost:8080/org/proj?token=yyy

# Sync specific tables
revisium sync data \
  --source revisium://cloud.revisium.io/org/proj \
  --target revisium://localhost:8080/org/proj \
  --tables Article,Category,Tag

# Sync with larger batches
revisium sync data \
  --source revisium://source.example.com/org/proj \
  --target revisium://target.example.com/org/proj \
  --batch-size 500 \
  --commit
```

### What It Does

1. Connects to source and target projects
2. Fetches rows from source revision
3. Compares with target draft rows (using hash)
4. Creates missing rows, updates changed, skips identical
5. Uses bulk operations with fallback
6. Optionally commits changes

## sync all

Full synchronization: schema first, then data.

```bash
revisium sync all --source <url> --target <url> [options]
```

### Options

Combines all options from `sync schema` and `sync data`.

### Examples

```bash
# Full sync from cloud to local
revisium sync all \
  --source revisium://cloud.revisium.io/org/proj/master:head?token=xxx \
  --target revisium://localhost:8080/org/proj?token=yyy \
  --commit

# Full sync with specific tables
revisium sync all \
  --source revisium://source.example.com/org/proj \
  --target revisium://target.example.com/org/proj \
  --tables Article,Category \
  --commit
```

## Environment Variables

For non-interactive usage:

```bash
# Source
REVISIUM_SOURCE_URL=revisium://cloud.revisium.io/org/proj/master:head
REVISIUM_SOURCE_TOKEN=eyJhbGciOiJIUzI1NiIs...

# Target
REVISIUM_TARGET_URL=revisium://localhost:8080/org/proj
REVISIUM_TARGET_TOKEN=eyJhbGciOiJIUzI1NiIs...
```

Then run without URL arguments:

```bash
revisium sync all --commit
```

## Examples

### Cloud to Local

```bash
revisium sync all \
  --source revisium://admin:pass@cloud.revisium.io/sandbox/demo/master:head \
  --target revisium://admin:pass@localhost:8080/admin/local/master \
  --commit
```

### Staging to Production

```bash
export REVISIUM_SOURCE_TOKEN=$STAGING_TOKEN
export REVISIUM_TARGET_TOKEN=$PRODUCTION_TOKEN

revisium sync all \
  --source revisium://staging.example.com/org/proj/master:head \
  --target revisium://prod.example.com/org/proj/master \
  --commit
```

### Schema Only (Dry Run)

```bash
revisium sync schema \
  --source revisium://cloud.revisium.io/org/proj \
  --target revisium://localhost:8080/org/proj \
  --dry-run
```

## See Also

- [URL Format](./url-format.md) - URL syntax
- [Authentication](./authentication.md) - Auth methods
