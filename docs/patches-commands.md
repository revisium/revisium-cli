# Patches Commands

Commands for selective field updates without affecting other data.

## Use Cases

- **Content Management** - Export content for translation or editing
- **Selective Updates** - Update specific fields without affecting others
- **Content Migration** - Move content between environments
- **Backup** - Create backups of specific field values

## patches save

Export field values from API as patch files.

```bash
revisium patches save --table <name> --paths <fields> --output <path> [--merge]
```

### Options

| Option | Description | Required |
|--------|-------------|----------|
| `--table <name>` | Table ID | Yes |
| `--paths <fields>` | Comma-separated field paths | Yes |
| `--output <path>` | Output folder or file | Yes |
| `--merge` | Save all rows in single file | No |

### Path Syntax

| Pattern | Example | Description |
|---------|---------|-------------|
| Simple field | `title` | Top-level field |
| Nested object | `metadata.author` | Nested property |
| Array element | `tags[0]` | First array element |
| Array property | `tags[0].name` | Property of array element |
| Deep nesting | `content.sections[0].title` | Multiple levels |

### Examples

```bash
# Save to separate files (one per row)
revisium patches save --table Article --paths title,status --output ./patches

# Save to merged file
revisium patches save --table Article --paths title,status --output ./patches.json --merge

# Save nested fields
revisium patches save --table Article --paths "title,metadata.author" --output ./patches

# Save array elements
revisium patches save --table Article --paths "tags[0].name,tags[1].name" --output ./patches
```

## patches validate

Validate patch files against table schema.

```bash
revisium patches validate --input <path>
```

### Examples

```bash
# Validate from folder
revisium patches validate --input ./patches

# Validate from merged file
revisium patches validate --input ./patches.json
```

## patches preview

Preview changes before applying.

```bash
revisium patches preview --input <path>
```

Shows a compact list of changed rows with count of changes per row.

### Examples

```bash
# Preview from folder
revisium patches preview --input ./patches

# Preview from merged file
revisium patches preview --input ./patches.json
```

## patches apply

Apply patches to update field values in API.

```bash
revisium patches apply --input <path> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--input <path>` | Folder or file with patches | Required |
| `--batch-size <n>` | Rows per batch | 100 |
| `-c, --commit` | Create revision after applying | false |

### Examples

```bash
# Apply patches
revisium patches apply --input ./patches

# Apply with custom batch size
revisium patches apply --input ./patches --batch-size 500

# Apply and create revision
revisium patches apply --input ./patches --commit
```

### How It Works

1. **Loading** - Loads patch files
2. **Validation** - Validates against table schemas
3. **Diff Comparison** - Compares with current API data
4. **Smart Apply** - Only applies where values differ
5. **Progress** - Shows detailed progress
6. **Revision** - Creates revision if `--commit` used

## Patch File Format

### Separate File (one per row)

```json
{
  "version": "1.0",
  "table": "Article",
  "rowId": "article-123",
  "createdAt": "2025-01-15T12:00:00.000Z",
  "patches": [
    { "op": "replace", "path": "title", "value": "Updated Title" },
    { "op": "replace", "path": "metadata.author", "value": "John Doe" }
  ]
}
```

### Merged File (multiple rows)

```json
{
  "version": "1.0",
  "table": "Article",
  "createdAt": "2025-01-15T12:00:00.000Z",
  "rows": [
    {
      "rowId": "article-123",
      "patches": [
        { "op": "replace", "path": "title", "value": "Updated Title" }
      ]
    },
    {
      "rowId": "article-456",
      "patches": [
        { "op": "replace", "path": "status", "value": "published" }
      ]
    }
  ]
}
```

## Workflow Example

```bash
# 1. Export field values
revisium patches save --table Article --paths title,description --output ./translations

# 2. Edit patch files (translate, modify, etc.)

# 3. Validate changes
revisium patches validate --input ./translations

# 4. Preview changes
revisium patches preview --input ./translations

# 5. Apply patches
revisium patches apply --input ./translations --commit
```
