<div align="center">

# Revisium CLI

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=revisium_revisium-cli&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=revisium_revisium-cli)
[![codecov](https://codecov.io/gh/revisium/revisium-cli/branch/master/graph/badge.svg?token=8XI9VJ6EQR)](https://codecov.io/gh/revisium/revisium-cli)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=revisium_revisium-cli&metric=bugs)](https://sonarcloud.io/summary/new_code?id=revisium_revisium-cli)
[![GitHub License](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/revisium/revisium-cli/blob/master/LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/revisium/revisium-cli)](https://github.com/revisium/revisium-cli/releases)

**Command-line interface for managing Revisium projects**

</div>

## Overview

A CLI tool for interacting with Revisium instances, providing migration management, schema export, and data export capabilities.

## Features

- 🚀 **Migration Management** - Save and apply database migrations with optional auto-commit
- 📋 **Schema Export/Import** - Export table schemas to JSON files and convert to migrations
- 📊 **Data Export/Upload** - Export and upload table rows with smart dependency handling
- ✏️ **Patches** - Selective field updates with validation, preview, and bulk apply
- 🔄 **Project Sync** - Synchronize schema and data between Revisium projects
- ⚡ **Bulk Operations** - Efficient batch create/update/patch with configurable batch size
- 🔗 **Foreign Key Dependencies** - Automatic table sorting based on relationships
- 💾 **Revision Control** - Create revisions automatically with --commit flag
- 🐳 **Docker Deployment** - Containerized automation for CI/CD and production deployments
- 🔧 **Flexible Configuration** - Environment variables, custom .env files, or command-line options
- ⚡ **CI/CD Ready** - Built-in support for GitHub Actions, GitLab CI, and Kubernetes

## Quick Start

### Installation

```bash
# Install globally
npm install -g revisium

# Or use with npx
npx revisium --help
```

### Basic Usage

```bash
# View all available commands
revisium --help

# Export table schemas
revisium schema save --folder ./schemas

# Convert schemas to migrations
revisium schema create-migrations --schemas-folder ./schemas --file ./migrations.json

# Export table data
revisium rows save --folder ./data

# Upload table data
revisium rows upload --folder ./data

# Upload with custom batch size (default: 100)
revisium rows upload --folder ./data --batch-size 500

# Upload and create revision automatically
revisium rows upload --folder ./data --commit

# Manage migrations
revisium migrate save --file ./migrations.json
revisium migrate apply --file ./migrations.json

# Apply migrations and create revision
revisium migrate apply --file ./migrations.json --commit

# Work with patches (selective field updates)
revisium patches save --table Article --paths title,status --output ./patches
revisium patches validate --input ./patches
revisium patches preview --input ./patches
revisium patches apply --input ./patches
revisium patches apply --input ./patches --commit

# Override with command-line options
revisium schema save --folder ./schemas --organization my-org --branch dev
```

## Commands

### Available Commands

- **`migrate save`** - Export migrations from Revisium to JSON file
- **`migrate apply`** - Apply migrations from JSON file to Revisium (supports `--commit`)
- **`schema save`** - Export table schemas to JSON files
- **`schema create-migrations`** - Convert schemas to migration format
- **`rows save`** - Export table data to JSON files
- **`rows upload`** - Upload table data from JSON files (supports `--commit`)
- **`patches validate`** - Validate patch files against table schema
- **`patches save`** - Save field values as patches for selective updates
- **`patches preview`** - Preview diff between patches and current API data
- **`patches apply`** - Apply patches to rows in API (supports `--commit`)
- **`sync schema`** - Synchronize schema migrations between Revisium projects
- **`sync data`** - Synchronize table data between Revisium projects
- **`sync all`** - Full synchronization (schema + data) between Revisium projects

### Global Options

All commands support these authentication and project options:

| Option                      | Environment Variable    | Description  | Default                      |
| --------------------------- | ----------------------- | ------------ | ---------------------------- |
| `--url <url>`               | `REVISIUM_API_URL`      | API base URL | `https://cloud.revisium.io/` |
| `--username <name>`         | `REVISIUM_USERNAME`     | Username     | -                            |
| `--password <pass>`         | `REVISIUM_PASSWORD`     | Password     | -                            |
| `-o, --organization <name>` | `REVISIUM_ORGANIZATION` | Organization | -                            |
| `-p, --project <name>`      | `REVISIUM_PROJECT`      | Project      | -                            |
| `-b, --branch <name>`       | `REVISIUM_BRANCH`       | Branch       | `master`                     |

**Quick Examples:**

```bash
# Export schemas with environment variables
revisium schema save --folder ./schemas

# Export with command-line options (overrides environment)
revisium schema save --folder ./schemas --url http://api.example.com --organization my-org

# Create migrations from schemas
revisium schema create-migrations --schemas-folder ./schemas --file ./migrations.json

# Apply migrations to different environment
revisium migrate apply --file ./migrations.json --url http://staging.example.com

# Apply migrations and create a revision
revisium migrate apply --file ./migrations.json --commit

# Upload data and create a revision
revisium rows upload --folder ./data --commit

# Validate patches
revisium patches validate --input ./patches

# Preview patches
revisium patches preview --input ./patches

# Apply patches
revisium patches apply --input ./patches

# Apply patches and create revision
revisium patches apply --input ./patches --commit

# Save field values as patches
revisium patches save --table Article --paths title,status --output ./patches
```

## Patches Commands

The patches commands allow you to selectively update specific fields in table rows without affecting other fields. This is useful for content management, translations, and partial updates.

### Save patches

Export current field values from the API as patch files:

```bash
# Save specific fields to separate files (one file per row, default)
revisium patches save --table Article --paths title,status --output ./patches

# Save to merged file (all rows in single JSON file)
revisium patches save --table Article --paths title,status --output ./patches.json --merge

# Save specific nested fields
revisium patches save --table Article --paths "title,metadata.author,metadata.tags" --output ./patches

# Save nested object fields
revisium patches save --table Article --paths "title,metadata.author" --output ./article-patches.json --merge

# Save array element fields (use index notation)
revisium patches save --table Article --paths "title,tags[0].name,tags[1].name" --output ./patches

# Save deeply nested fields
revisium patches save --table Article --paths "content.sections[0].title,content.sections[0].body" --output ./patches

# Save from specific branch (separate files)
revisium patches save --table Article --paths title --output ./patches --branch development

# Save from specific branch (merged file)
revisium patches save --table Article --paths title,status --output ./patches.json --merge --branch development
```

**Path Syntax:**
- Simple fields: `title`, `status`
- Nested objects: `metadata.author`, `content.title`
- Array elements: `tags[0]`, `sections[1].name`
- Multiple paths: Use comma-separated list (quote the entire string if it contains special characters)
- Special characters: Always quote the entire `--paths` value when using complex paths

### Validate patches

Validate patch files against the table schema from the API:

```bash
# Validate patches from folder
revisium patches validate --input ./patches

# Validate patches from single file
revisium patches validate --input ./patches.json

# Validate against specific branch schema
revisium patches validate --input ./patches --branch development
```

### Preview patches

Compare patches with current API data to see what would change:

```bash
# Preview changes (compact list)
revisium patches preview --input ./patches

# Preview from merged file
revisium patches preview --input ./patches.json

# Preview against specific branch
revisium patches preview --input ./patches --branch development
```

The preview command shows a compact list of changed rows with count of changes per row.

### Apply patches

Apply patches to update field values in the API. The command:

- Validates patches against table schemas
- Compares with current API data to detect changes (bulk loading for speed)
- Only applies patches where values differ from current data
- Uses bulk API operations for efficient patching
- Falls back to single-row operations for older API versions
- Supports automatic revision creation with `--commit` flag

```bash
# Apply patches from folder
revisium patches apply --input ./patches

# Apply patches from merged file
revisium patches apply --input ./patches.json

# Apply patches and create a revision
revisium patches apply --input ./patches --commit

# Apply with custom batch size (default: 100)
revisium patches apply --input ./patches --batch-size 500

# Apply to specific branch
revisium patches apply --input ./patches --branch development

# Apply and create revision on specific branch
revisium patches apply --input ./patches --branch development --commit
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--input <path>` | Folder or file with patch files | Required |
| `--batch-size <n>` | Number of rows per batch | 100 |
| `-c, --commit` | Create revision after applying | false |

**What happens when applying patches:**

1. **Authentication** - Logs in to the API
2. **Loading** - Loads patch files from folder or merged file
3. **Validation** - Validates all patches against table schemas
4. **Diff Comparison** - Compares patches with current API data
5. **Smart Apply** - Only applies patches where values differ
6. **Progress** - Shows detailed progress for each table and row
7. **Statistics** - Displays summary of applied, skipped, and failed patches
8. **Revision** - Creates revision if `--commit` flag is used

**Error Handling:**

- Stops if validation fails before applying any patches
- Shows detailed error messages for validation failures
- Stops if API returns errors during application
- Exit code 1 on errors, 0 on success

**Patch File Format:**

Separate file (one per row):

```json
{
  "version": "1.0",
  "table": "Article",
  "rowId": "article-123",
  "createdAt": "2025-10-15T12:00:00.000Z",
  "patches": [
    { "op": "replace", "path": "title", "value": "Updated Title" },
    { "op": "replace", "path": "metadata.author", "value": "John Doe" },
    { "op": "replace", "path": "tags[0].name", "value": "Technology" },
    { "op": "replace", "path": "content.sections[0].title", "value": "Introduction" }
  ]
}
```

Merged file (multiple rows):

```json
{
  "version": "1.0",
  "table": "Article",
  "createdAt": "2025-10-15T12:00:00.000Z",
  "rows": [
    {
      "rowId": "article-123",
      "patches": [
        { "op": "replace", "path": "title", "value": "Updated Title" },
        { "op": "replace", "path": "metadata.author", "value": "Jane Smith" }
      ]
    },
    {
      "rowId": "article-456",
      "patches": [
        { "op": "replace", "path": "status", "value": "published" },
        { "op": "replace", "path": "tags[0]", "value": "Featured" }
      ]
    }
  ]
}
```

**Path Examples in Patches:**
- Simple field: `"path": "title"`
- Nested object: `"path": "metadata.author"`
- Array element: `"path": "tags[0]"` or `"path": "tags[1].name"`
- Deep nesting: `"path": "content.sections[0].body"`

**Use Cases:**

- **Content Management**: Export content for translation or editing
- **Selective Updates**: Update specific fields without affecting others
- **Content Migration**: Move content between environments
- **Backup**: Create backups of specific field values

**Workflow Example:**

```bash
# 1. Export current field values as patches
revisium patches save --table Article --paths title,description --output ./translations

# 2. Edit patch files manually (translate content, etc.)

# 3. Validate edited patches
revisium patches validate --input ./translations

# 4. Preview changes before applying
revisium patches preview --input ./translations

# 5. Apply patches to update the API
revisium patches apply --input ./translations

# 6. (Optional) Apply and create a revision
revisium patches apply --input ./translations --commit
```

## Rows Upload

The `rows upload` command uploads table data from JSON files with smart handling:

### Features

- **Bulk Operations** - Uses batch create/update API for efficient uploads
- **Smart Diff** - Only creates new rows and updates changed rows, skips identical data
- **Backward Compatible** - Falls back to single-row operations for older API versions
- **Progress Tracking** - Real-time progress indicator during upload
- **Configurable Batch Size** - Adjust batch size for optimal performance

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --folder <path>` | Folder containing row JSON files | Required |
| `-t, --tables <list>` | Comma-separated table IDs to upload | All tables |
| `--batch-size <n>` | Number of rows per batch | 100 |
| `-c, --commit` | Create revision after upload | false |

### Examples

```bash
# Basic upload
revisium rows upload --folder ./data

# Upload specific tables
revisium rows upload --folder ./data --tables users,posts

# Upload with larger batch size for better performance
revisium rows upload --folder ./data --batch-size 500

# Upload and commit changes
revisium rows upload --folder ./data --commit
```

### How it works

1. **Fetch existing rows** - Loads all existing rows from the API for comparison
2. **Categorize rows** - Determines which rows to create, update, or skip
3. **Batch upload** - Uses bulk API operations with configurable batch size
4. **Fallback mode** - If bulk API is unavailable, falls back to single-row operations
5. **Progress display** - Shows real-time progress with row counts

## Sync Commands

The sync commands enable synchronization between two Revisium projects, potentially on different instances. This is useful for:

- **Content Migration**: Move content between environments (staging → production)
- **Schema Replication**: Keep schemas in sync across multiple instances
- **Backup/Restore**: Replicate data to backup instances
- **Multi-tenant Sync**: Synchronize content across tenant projects

### URL Format

Sync commands use a special URL format to specify source and target projects:

```
revisium://[username[:password]@]host[:port]/organization/project/branch[:revision][?token=...]
```

**URL Parts:**

| Part | Description | Default |
|------|-------------|---------|
| `host` | Revisium server hostname | Required |
| `port` | Server port | 443 (https) or 8080 (http) |
| `organization` | Organization name | Prompted |
| `project` | Project name | Prompted |
| `branch` | Branch name | `master` |
| `revision` | Revision target (after `:`) | `draft` |

**Revision Values:**

| Value | Description |
|-------|-------------|
| `draft` | Draft (uncommitted) revision - **default** |
| `head` | Head (last committed) revision |
| `<revision-id>` | Specific revision by ID |

**Important:** Target revision must always be `draft` (sync writes to draft). Source can be any revision.

### Authentication Methods

Three authentication methods are supported (mutually exclusive):

| Method | URL Format | Description |
|--------|------------|-------------|
| **Token** | `?token=eyJ...` | JWT token from UI (recommended) |
| **API Key** | `?apikey=ak_...` | API key for automation (future) |
| **Password** | `user:pass@host` | Username and password |

**Token Authentication (Recommended):**

Get your token from the Revisium UI:
- For cloud.revisium.io: https://cloud.revisium.io/get-mcp-token
- For self-hosted: `https://your-host/get-mcp-token`

```bash
# Using token (query parameter)
revisium://cloud.revisium.io/org/proj/master:head?token=eyJhbGciOiJIUzI1NiIs...

# Token via environment variable
export REVISIUM_SOURCE_TOKEN=eyJhbGciOiJIUzI1NiIs...
revisium sync all --source revisium://cloud.revisium.io/org/proj/master:head
```

**Password Authentication:**

```bash
# Credentials in URL
revisium://admin:secret@cloud.revisium.io/org/proj/master:head

# Credentials via environment variables
export REVISIUM_SOURCE_USERNAME=admin
export REVISIUM_SOURCE_PASSWORD=secret
```

**Interactive Mode:**

If no credentials are provided, you'll be prompted to choose:

```
[source] Choose authentication method:
  ❯ Token (copy from https://cloud.revisium.io/get-mcp-token)
    API Key (for automated access)
    Username & Password

[source] Paste token: ****
  ✓ Authenticated as admin
```

**Validation:**

You cannot mix authentication methods. These will fail:

```bash
# ❌ Cannot use both credentials and token
revisium://admin:pass@host/org/proj?token=xxx

# ❌ Cannot use both token and apikey
revisium://host/org/proj?token=xxx&apikey=yyy
```

**Examples:**

```bash
# Token auth - source from head revision
revisium://cloud.revisium.io/org/proj/master:head?token=eyJhbG...

# Password auth - source from draft (default)
revisium://admin:secret@cloud.revisium.io/myorg/myproject/develop

# Source from specific revision ID with token
revisium://cloud.revisium.io/org/proj/master:abc123def?token=eyJhbG...

# Localhost with port, reading from head
revisium://localhost:8080/org/proj/master:head?token=eyJhbG...

# URL without auth (will prompt interactively)
revisium://cloud.revisium.io/org/proj
```

**Protocol Detection:**

| Host | Protocol | Port |
|------|----------|------|
| `localhost` | http | Prompted (default: 8080) |
| `127.0.0.1` | http | Prompted (default: 8080) |
| Other hosts | Prompted (default: https) | Auto (443 for https) |

### Sync Schema

Synchronize schema migrations from source to target:

```bash
revisium sync schema \
  --source revisium://admin:pass@source.example.com/org/proj/master \
  --target revisium://admin:pass@target.example.com/org/proj/master \
  [--commit] \
  [--dry-run]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --source <url>` | Source project URL | Required |
| `-t, --target <url>` | Target project URL | Required |
| `-c, --commit` | Create revision after sync | false |
| `--dry-run` | Preview without applying | false |

**What it does:**

1. Connects to source and target projects
2. Fetches migrations from source revision (default: draft, can specify head or revision ID)
3. Applies migrations to target draft revision
4. Optionally commits changes

### Sync Data

Synchronize table rows from source to target:

```bash
revisium sync data \
  --source revisium://admin:pass@source.example.com/org/proj/master \
  --target revisium://admin:pass@target.example.com/org/proj/master \
  [--tables Article,Category] \
  [--batch-size 100] \
  [--commit] \
  [--dry-run]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --source <url>` | Source project URL | Required |
| `-t, --target <url>` | Target project URL | Required |
| `--tables <list>` | Comma-separated tables to sync | All tables |
| `--batch-size <n>` | Rows per batch for bulk operations | 100 |
| `-c, --commit` | Create revision after sync | false |
| `--dry-run` | Preview without applying | false |

**What it does:**

1. Connects to source and target projects
2. Fetches rows from source revision (default: draft, can specify head or revision ID)
3. Compares with target draft rows (using object-hash)
4. Creates missing rows, updates changed rows, skips identical
5. Uses bulk operations with fallback to single-row
6. Optionally commits changes

### Sync All

Full synchronization: schema first, then data:

```bash
revisium sync all \
  --source revisium://admin:pass@source.example.com/org/proj/master \
  --target revisium://admin:pass@target.example.com/org/proj/master \
  [--tables Article,Category] \
  [--batch-size 100] \
  [--commit] \
  [--dry-run]
```

**Options:**

Combines all options from `sync schema` and `sync data`.

### Environment Variables

Sync commands support environment variables for non-interactive usage:

```bash
# Source configuration
REVISIUM_SOURCE_URL=revisium://cloud.revisium.io/org/proj/master:head
REVISIUM_SOURCE_TOKEN=eyJhbGciOiJIUzI1NiIs...    # Token auth (recommended)
# OR
REVISIUM_SOURCE_API_KEY=ak_xxx...                 # API key auth (future)
# OR
REVISIUM_SOURCE_USERNAME=admin                    # Password auth
REVISIUM_SOURCE_PASSWORD=secret

# Target configuration
REVISIUM_TARGET_URL=revisium://localhost:8080/org/proj/master
REVISIUM_TARGET_TOKEN=eyJhbGciOiJIUzI1NiIs...
# OR
REVISIUM_TARGET_USERNAME=admin
REVISIUM_TARGET_PASSWORD=local-pass
```

**Priority:**

1. URL auth (`?token=...` or `user:pass@host`)
2. Environment variables (`TOKEN` > `API_KEY` > `USERNAME/PASSWORD`)
3. Interactive prompts (for missing values)

### Examples

```bash
# Full sync from cloud to local
revisium sync all \
  --source revisium://admin:cloud-pass@cloud.revisium.io/sandbox/demo/master \
  --target revisium://admin:local-pass@localhost:8080/admin/local-copy/master \
  --commit

# Sync only schema (dry run)
revisium sync schema \
  --source revisium://cloud.revisium.io/org/proj \
  --target revisium://localhost:8080/org/proj \
  --dry-run

# Sync specific tables
revisium sync data \
  --source revisium://admin@cloud.revisium.io/org/proj/master \
  --target revisium://admin@localhost:8080/org/proj/master \
  --tables Article,Category,Tag

# Using environment variables (non-interactive)
export REVISIUM_SOURCE_URL=revisium://cloud.revisium.io/org/proj/master
export REVISIUM_SOURCE_USERNAME=admin
export REVISIUM_SOURCE_PASSWORD=secret
export REVISIUM_TARGET_URL=revisium://localhost:8080/org/proj/master
export REVISIUM_TARGET_USERNAME=admin
export REVISIUM_TARGET_PASSWORD=local

revisium sync all --commit
```

## Foreign Key Dependencies

Revisium supports foreign key relationships between tables using the `foreignKey` field in table schemas. When uploading data with the CLI, tables are automatically sorted based on these dependencies to prevent foreign key constraint errors.

### How it works:

1. **Dependency Analysis**: CLI fetches all table schemas and analyzes `foreignKey` fields
2. **Topological Sorting**: Tables are reordered so dependencies are uploaded first
3. **Circular Detection**: Warns about circular dependencies that can't be automatically resolved

### Example:

Given tables with these relationships:

- `users` table has foreign key to `posts`
- `posts` table has foreign key to `images`

The CLI will automatically upload in this order: `images` → `posts` → `users`

### Circular Dependencies:

If two tables reference each other (e.g., `users` ↔ `posts`), the CLI will:

- ⚠️ Log warnings about circular dependencies
- 💡 Suggest uploading in multiple passes or breaking the circular reference
- Continue with upload but foreign key errors may occur

## Configuration

### Environment File Configuration

By default, the CLI loads environment variables from `.env` in the current directory. You can specify a custom environment file:

```bash
# Use custom environment file
export REVISIUM_ENV_FILE=/path/to/custom.env
revisium schema save --folder ./schemas

# Or specify relative path
export REVISIUM_ENV_FILE=./config/production.env
revisium migrate apply --file ./migrations.json
```

**Environment Variables (Optional):**
Create a `.env` file (or custom file) for defaults:

```env
REVISIUM_API_URL=https://cloud.revisium.io/    # Default
REVISIUM_USERNAME=your_username
REVISIUM_PASSWORD=your_password
REVISIUM_ORGANIZATION=your_organization        # Required for most operations
REVISIUM_PROJECT=your_project                  # Required for most operations
REVISIUM_BRANCH=master                         # Default
```

**Environment File Options:**

- **`REVISIUM_ENV_FILE`** - Path to custom environment file (defaults to `.env`)
- File must exist and be a regular file (not a directory)
- Supports both absolute and relative paths

**Command-line Options:**
Override any environment variable:

```bash
revisium schema save --folder ./schemas --organization acme --project website
```

**Defaults:**

- API URL: `https://cloud.revisium.io/`
- Branch: `master`
- Authentication: Optional (skipped if credentials missing)

## Docker Deployment

The CLI is available as a Docker image for deployment automation, CI/CD pipelines, and containerized environments like Kubernetes.

### Docker Image

```bash
# Pull the official image
docker pull revisium/revisium-cli

# Or use a specific version
docker pull revisium/revisium-cli:1.0.0
```

### Automated Migrations and Data Seeding

The Docker image includes an entrypoint script that automatically applies migrations and uploads data when the container starts. This is perfect for deployment automation and CI/CD workflows.

#### Environment Variables

| Variable                  | Description                    | Default                | Required |
| ------------------------- | ------------------------------ | ---------------------- | -------- |
| `REVISIUM_API_URL`        | API endpoint                   | -                      | ✅       |
| `REVISIUM_USERNAME`       | Username for authentication    | -                      | ✅       |
| `REVISIUM_PASSWORD`       | Password for authentication    | -                      | ✅       |
| `REVISIUM_ORGANIZATION`   | Organization name              | -                      | ✅       |
| `REVISIUM_PROJECT`        | Project name                   | -                      | ✅       |
| `REVISIUM_BRANCH`         | Branch name                    | -                      | ✅       |
| `REVISIUM_MIGRATE_COMMIT` | Auto-commit after migrations   | `false`                | ❌       |
| `REVISIUM_UPLOAD_COMMIT`  | Auto-commit after data upload  | `false`                | ❌       |
| `MIGRATIONS_FILE`         | Path to migrations file        | `/app/migrations.json` | ❌       |
| `DATA_DIR`                | Path to data directory         | `/app/data`            | ❌       |
| `DRY_RUN`                 | Preview mode without execution | `false`                | ❌       |

#### Container Behavior

1. **Apply Migrations**: If `/app/migrations.json` exists, runs:
   ```bash
   revisium migrate apply --file /app/migrations.json [--commit]
   ```
2. **Upload Data**: If `/app/data` directory exists and contains files, runs:
   ```bash
   revisium rows upload --folder /app/data [--commit]
   ```
3. **Auto-commit**: `--commit` flag is added when `REVISIUM_MIGRATE_COMMIT` or `REVISIUM_UPLOAD_COMMIT` is `true`
4. **Graceful Handling**: Skips missing files/directories without errors

### Example: Custom Deployment Image

Create your own deployment image with migrations and data:

**Dockerfile:**

```dockerfile
FROM revisium/revisium-cli:latest

# Copy your migrations and data
COPY migrations.json /app/migrations.json
COPY data/ /app/data/

# The entrypoint will automatically:
# 1. Apply migrations from /app/migrations.json
# 2. Upload data from /app/data/
# 3. Create revisions if commit flags are enabled
```

**docker-compose.yml:**

```yaml
version: '3.9'

services:
  revisium-deployment:
    build: . # Uses the Dockerfile above
    environment:
      REVISIUM_API_URL: 'https://api.revisium.example.com'
      REVISIUM_USERNAME: 'deployment-user'
      REVISIUM_PASSWORD: 'secure-password'
      REVISIUM_ORGANIZATION: 'organization'
      REVISIUM_PROJECT: 'project'
      REVISIUM_BRANCH: 'master'

      # Auto-commit changes for deployment
      REVISIUM_MIGRATE_COMMIT: 'true'
      REVISIUM_UPLOAD_COMMIT: 'true'

      # Optional: preview mode
      # DRY_RUN: 'true'
```

### Kubernetes Deployment

Use as an init container or job for automated deployments:

**k8s-migration-job.yaml:**

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: revisium-migration
spec:
  template:
    spec:
      containers:
        - name: revisium-cli
          image: my-registry/my-app-migrations:v1.0.0
          env:
            - name: REVISIUM_API_URL
              value: 'https://revisium.example.com'
            - name: REVISIUM_USERNAME
              valueFrom:
                secretKeyRef:
                  name: revisium-credentials
                  key: username
            - name: REVISIUM_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: revisium-credentials
                  key: password
            - name: REVISIUM_ORGANIZATION
              value: 'production'
            - name: REVISIUM_PROJECT
              value: 'main-app'
            - name: REVISIUM_BRANCH
              value: 'master'
            - name: REVISIUM_MIGRATE_COMMIT
              value: 'true'
            - name: REVISIUM_UPLOAD_COMMIT
              value: 'true'
      restartPolicy: OnFailure
```

## Development

```bash
git clone https://github.com/revisium/revisium-cli.git
cd revisium-cli
npm install
npm run build
```

## License

MIT License - see [LICENSE](LICENSE) file for details.
