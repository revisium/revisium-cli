# Rows Commands

Commands for exporting and uploading table data.

## rows save

Export table rows from Revisium to JSON files.

```bash
revisium rows save --folder <path> [--tables <list>]
```

### Options

| Option | Description | Required |
|--------|-------------|----------|
| `-f, --folder <path>` | Output folder for row files | Yes |
| `-t, --tables <list>` | Comma-separated table IDs | No (all tables) |
| `--url <url>` | Revisium URL (see [URL Format](./url-format.md)) | No* |

*If `--url` is not provided, uses `REVISIUM_URL` environment variable or prompts interactively.

### Examples

```bash
# Export all tables (using REVISIUM_URL from environment)
revisium rows save --folder ./data

# Export specific tables
revisium rows save --folder ./data --tables users,posts

# Export with explicit URL and token
revisium rows save --folder ./data \
  --url revisium://cloud.revisium.io/myorg/myproject/master?token=$TOKEN

# Export from head revision
revisium rows save --folder ./data \
  --url revisium://cloud.revisium.io/myorg/myproject/master:head?token=$TOKEN
```

### Output Format

Creates a folder structure with one JSON file per row:

```text
data/
├── users/
│   ├── user-1.json
│   └── user-2.json
└── posts/
    ├── post-1.json
    └── post-2.json
```

Each file contains the row data:

```json
{
  "name": "John Doe",
  "email": "john@example.com"
}
```

## rows upload

Upload table rows from JSON files to Revisium.

```bash
revisium rows upload --folder <path> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --folder <path>` | Folder with row files | Required |
| `-t, --tables <list>` | Comma-separated table IDs | All tables |
| `--batch-size <n>` | Rows per batch | 100 |
| `-c, --commit` | Create revision after upload | false |
| `--url <url>` | Revisium URL (see [URL Format](./url-format.md)) | Environment |

### Examples

```bash
# Basic upload (using REVISIUM_URL from environment)
revisium rows upload --folder ./data

# Upload specific tables
revisium rows upload --folder ./data --tables users,posts

# Upload with larger batch size
revisium rows upload --folder ./data --batch-size 500

# Upload and create revision
revisium rows upload --folder ./data --commit

# Upload with explicit URL and token
revisium rows upload --folder ./data --commit \
  --url revisium://cloud.revisium.io/myorg/myproject/master?token=$TOKEN

# Upload with credentials via environment variables
export REVISIUM_USERNAME=admin
export REVISIUM_PASSWORD=secret
revisium rows upload --folder ./data --commit \
  --url revisium://cloud.revisium.io/myorg/myproject/master
```

## Features

### Smart Diff

The upload command compares local files with API data:

- **Create** - New rows that don't exist in API
- **Update** - Rows with changed data
- **Skip** - Identical rows (no changes)

### Bulk Operations

Uses batch API for efficient uploads:

- Configurable batch size (default: 100)
- Automatic fallback to single-row operations for older APIs
- Real-time progress indicator

### Foreign Key Dependencies

Tables are automatically sorted based on foreign key relationships:

```text
# Given these dependencies:
# users → posts (users references posts)
# posts → images (posts references images)

# Upload order will be:
# 1. images
# 2. posts
# 3. users
```

## Circular Dependencies

If two tables reference each other (e.g., `users` ↔ `posts`):

- CLI logs warnings about circular dependencies
- Suggests uploading in multiple passes
- Continues with upload (foreign key errors may occur)

### Handling Circular Dependencies

```bash
# Option 1: Upload without foreign key values first
# Edit files to remove circular references
revisium rows upload --folder ./data --commit

# Option 2: Upload in multiple passes
revisium rows upload --folder ./data --tables images,posts
revisium rows upload --folder ./data --tables users --commit
```

## Workflow

### Export and Import

```bash
# Export from source
revisium rows save --folder ./data \
  --url revisium://source.example.com/myorg/myproject/master:head?token=$SOURCE_TOKEN

# Import to target
revisium rows upload --folder ./data --commit \
  --url revisium://target.example.com/myorg/myproject/master?token=$TARGET_TOKEN
```

### Incremental Updates

```bash
# Edit local JSON files
# Then upload changes (using REVISIUM_URL from environment)
revisium rows upload --folder ./data --commit
```

See [URL Format](./url-format.md) for complete URL syntax and [Authentication](./authentication.md) for auth options.
