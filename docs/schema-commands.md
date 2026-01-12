# Schema Commands

Commands for exporting and converting table schemas.

## schema save

Export table schemas from Revisium to JSON files.

```bash
revisium schema save --folder <path>
```

### Options

| Option | Description | Required |
|--------|-------------|----------|
| `-f, --folder <path>` | Output folder for schema files | Yes |
| `--url <url>` | Revisium URL (see [URL Format](./url-format.md)) | No* |

*If `--url` is not provided, uses `REVISIUM_URL` environment variable or prompts interactively.

### Examples

```bash
# Export all schemas (using REVISIUM_URL from environment)
revisium schema save --folder ./schemas

# Export with explicit URL and token
revisium schema save --folder ./schemas \
  --url revisium://cloud.revisium.io/myorg/myproject/master?token=$TOKEN

# Export from head revision
revisium schema save --folder ./schemas \
  --url revisium://cloud.revisium.io/myorg/myproject/master:head?token=$TOKEN

# Local development
revisium schema save --folder ./schemas \
  --url revisium://localhost:8080/admin/demo/master?token=$TOKEN
```

### Output Format

Creates one JSON file per table in the specified folder:

```text
schemas/
├── users.json
├── posts.json
└── comments.json
```

Each file contains a JSON Schema:

```json
{
  "type": "object",
  "properties": {
    "title": { "type": "string", "default": "" },
    "status": { "type": "string", "default": "draft" }
  },
  "additionalProperties": false,
  "required": ["title", "status"]
}
```

## schema create-migrations

Convert saved schemas to migration format.

```bash
revisium schema create-migrations --schemas-folder <path> --file <path>
```

### Options

| Option | Description | Required |
|--------|-------------|----------|
| `--schemas-folder <path>` | Folder with schema JSON files | Yes |
| `-f, --file <path>` | Output migrations file | Yes |

### Examples

```bash
# Create migrations from schemas
revisium schema create-migrations --schemas-folder ./schemas --file ./migrations.json
```

### Output Format

Creates a JSON file with array of migrations:

```json
[
  {
    "changeType": "init",
    "tableId": "users",
    "hash": "a1b2c3d4...",
    "id": "2024-01-15T10:30:00.000Z",
    "schema": { ... }
  },
  {
    "changeType": "init",
    "tableId": "posts",
    "hash": "e5f6g7h8...",
    "id": "2024-01-15T10:30:00.001Z",
    "schema": { ... }
  }
]
```

### Migration Types

| Type | Description |
|------|-------------|
| `init` | Create new table with full schema |
| `update` | Modify existing table with JSON Patch |
| `rename` | Rename table |
| `remove` | Delete table |

## Workflow

Typical workflow for schema management:

```bash
# 1. Export schemas from source environment
revisium schema save --folder ./schemas \
  --url revisium://source.example.com/myorg/myproject/master:head?token=$SOURCE_TOKEN

# 2. Convert to migrations
revisium schema create-migrations --schemas-folder ./schemas --file ./migrations.json

# 3. Apply to target environment
revisium migrate apply --file ./migrations.json --commit \
  --url revisium://target.example.com/myorg/myproject/master?token=$TARGET_TOKEN
```

See [URL Format](./url-format.md) for complete URL syntax and authentication options.
