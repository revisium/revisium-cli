# Migrate Commands

Commands for saving and applying database migrations.

## migrate save

Export migrations from Revisium to a JSON file.

```bash
revisium migrate save --file <path>
```

### Options

| Option | Description | Required |
|--------|-------------|----------|
| `-f, --file <path>` | Output file path | Yes |
| `--url <url>` | Revisium URL (see [URL Format](./url-format.md)) | No* |

*If `--url` is not provided, uses `REVISIUM_URL` environment variable or prompts interactively.

### Examples

```bash
# Save migrations (using REVISIUM_URL from environment)
revisium migrate save --file ./migrations.json

# Save with explicit URL and token
revisium migrate save --file ./migrations.json \
  --url revisium://cloud.revisium.io/myorg/myproject/master?token=$TOKEN

# Save from head revision
revisium migrate save --file ./migrations.json \
  --url revisium://cloud.revisium.io/myorg/myproject/master:head?token=$TOKEN
```

## migrate apply

Apply migrations from a JSON file to Revisium.

```bash
revisium migrate apply --file <path> [--commit]
```

### Options

| Option | Description | Required |
|--------|-------------|----------|
| `-f, --file <path>` | Migrations file path | Yes |
| `-c, --commit` | Create revision after applying | No |
| `--url <url>` | Revisium URL (see [URL Format](./url-format.md)) | No* |

*If `--url` is not provided, uses `REVISIUM_URL` environment variable or prompts interactively.

### Examples

```bash
# Apply migrations (using REVISIUM_URL from environment)
revisium migrate apply --file ./migrations.json

# Apply and create revision
revisium migrate apply --file ./migrations.json --commit

# Apply to specific environment with token
revisium migrate apply --file ./migrations.json --commit \
  --url revisium://staging.example.com/myorg/myproject/master?token=$TOKEN

# Apply with credentials via environment variables
export REVISIUM_USERNAME=admin
export REVISIUM_PASSWORD=secret
revisium migrate apply --file ./migrations.json --commit \
  --url revisium://cloud.revisium.io/myorg/myproject/master
```

## Migration Format

### Init Migration

Creates a new table:

```json
{
  "changeType": "init",
  "tableId": "users",
  "hash": "a1b2c3d4e5f6...",
  "id": "2024-01-15T10:30:00.000Z",
  "schema": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "default": "" },
      "email": { "type": "string", "default": "" }
    },
    "additionalProperties": false,
    "required": ["name", "email"]
  }
}
```

### Update Migration

Modifies an existing table using JSON Patch:

```json
{
  "changeType": "update",
  "tableId": "users",
  "hash": "b2c3d4e5f6g7...",
  "id": "2024-01-16T10:30:00.000Z",
  "patches": [
    { "op": "add", "path": "/properties/phone", "value": { "type": "string", "default": "" } },
    { "op": "add", "path": "/required/-", "value": "phone" }
  ]
}
```

### Rename Migration

Renames a table:

```json
{
  "changeType": "rename",
  "tableId": "users",
  "nextTableId": "customers",
  "id": "2024-01-17T10:30:00.000Z"
}
```

### Remove Migration

Deletes a table:

```json
{
  "changeType": "remove",
  "tableId": "old_table",
  "id": "2024-01-18T10:30:00.000Z"
}
```

## Workflow

### Export and Apply

```bash
# Export from source
revisium migrate save --file ./migrations.json \
  --url revisium://source.example.com/myorg/myproject/master:head?token=$SOURCE_TOKEN

# Apply to target
revisium migrate apply --file ./migrations.json --commit \
  --url revisium://target.example.com/myorg/myproject/master?token=$TARGET_TOKEN
```

### Version Control

```bash
# Save migrations to git
revisium migrate save --file ./migrations.json \
  --url revisium://cloud.revisium.io/myorg/myproject/master?token=$TOKEN
git add migrations.json
git commit -m "Add user phone field migration"

# Apply in CI/CD (credentials via environment)
export REVISIUM_URL=revisium://cloud.revisium.io/myorg/myproject/master
export REVISIUM_TOKEN=$DEPLOY_TOKEN
revisium migrate apply --file ./migrations.json --commit
```

See [URL Format](./url-format.md) for complete URL syntax and [Authentication](./authentication.md) for auth options.
