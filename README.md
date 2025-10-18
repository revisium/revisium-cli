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
- Compares with current API data to detect changes
- Only applies patches where values differ from current data
- Supports automatic revision creation with `--commit` flag

```bash
# Apply patches from folder
revisium patches apply --input ./patches

# Apply patches from merged file
revisium patches apply --input ./patches.json

# Apply patches and create a revision
revisium patches apply --input ./patches --commit

# Apply to specific branch
revisium patches apply --input ./patches --branch development

# Apply and create revision on specific branch
revisium patches apply --input ./patches --branch development --commit
```

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
