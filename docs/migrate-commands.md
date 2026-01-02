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

### Examples

```bash
# Save migrations
revisium migrate save --file ./migrations.json

# Save from specific branch
revisium migrate save --file ./migrations.json --branch develop
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

### Examples

```bash
# Apply migrations
revisium migrate apply --file ./migrations.json

# Apply and create revision
revisium migrate apply --file ./migrations.json --commit

# Apply to different environment
revisium migrate apply --file ./migrations.json --url https://staging.example.com
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
revisium migrate save --file ./migrations.json --url https://source.example.com

# Apply to target
revisium migrate apply --file ./migrations.json --url https://target.example.com --commit
```

### Version Control

```bash
# Save migrations to git
revisium migrate save --file ./migrations.json
git add migrations.json
git commit -m "Add user phone field migration"

# Apply in CI/CD
revisium migrate apply --file ./migrations.json --commit
```
