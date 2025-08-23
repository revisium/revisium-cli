<div align="center">

# Revisium CLI

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=revisium_revisium-cli&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=revisium_revisium-cli)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=revisium_revisium-cli&metric=coverage)](https://sonarcloud.io/summary/new_code?id=revisium_revisium-cli)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=revisium_revisium-cli&metric=bugs)](https://sonarcloud.io/summary/new_code?id=revisium_revisium-cli)
[![GitHub License](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/revisium/revisium-cli/blob/master/LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/revisium/revisium-cli)](https://github.com/revisium/revisium-cli/releases)

**Command-line interface for managing Revisium projects**

</div>

## Overview

A CLI tool for interacting with Revisium instances, providing migration management, schema export, and data export capabilities.

## Features

- 🚀 **Migration Management** - Save and apply database migrations with optional commit
- 📋 **Schema Export** - Export table schemas to JSON files
- 📊 **Data Export** - Export table rows to JSON files
- ⬆️ **Data Upload** - Upload table rows with dependency sorting and smart updates
- 💾 **Revision Control** - Create revisions automatically with --commit flag
- 🔧 **Flexible Configuration** - Environment variables or command-line options

## Quick Start

### Installation

```bash
# Install globally
npm install -g revisium

# Or use with npx
npx revisium --help
```

**All configuration is optional** - see [Configuration](#configuration) section for details.

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

# Override with command-line options
revisium schema save --folder ./schemas --organization my-org --branch dev
```

## Commands

For detailed usage information and examples, see [CLI Usage Guide](CLI_USAGE.md).

### Available Commands

- **`migrate save`** - Export migrations from Revisium to JSON file
- **`migrate apply`** - Apply migrations from JSON file to Revisium (supports `--commit`)
- **`schema save`** - Export table schemas to JSON files
- **`schema create-migrations`** - Convert schemas to migration format
- **`rows save`** - Export table data to JSON files
- **`rows upload`** - Upload table data from JSON files (supports `--commit`)

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

**Environment Variables (Optional):**
Create a `.env` file for defaults:

```env
REVISIUM_API_URL=https://cloud.revisium.io/    # Default
REVISIUM_USERNAME=your_username
REVISIUM_PASSWORD=your_password
REVISIUM_ORGANIZATION=your_organization        # Required for most operations
REVISIUM_PROJECT=your_project                  # Required for most operations
REVISIUM_BRANCH=master                         # Default
```

**Command-line Options:**
Override any environment variable:

```bash
revisium schema save --folder ./schemas --organization acme --project website
```

**Defaults:**

- API URL: `https://cloud.revisium.io/`
- Branch: `master`
- Authentication: Optional (skipped if credentials missing)

## Development

```bash
git clone https://github.com/revisium/revisium-cli.git
cd revisium-cli
npm install
npm run build
```

## License

MIT License - see [LICENSE](LICENSE) file for details.
