<div align="center">

# Revisium CLI

[![GitHub Release](https://img.shields.io/github/v/release/revisium/revisium-cli)](https://github.com/revisium/revisium-cli/releases)
[![GitHub License](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/revisium/supergraph-builder/blob/master/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11.0-red.svg)](https://nestjs.com/)
[![npm version](https://img.shields.io/npm/v/revisium.svg)](https://www.npmjs.com/package/revisium)

**Command-line interface for managing Revisium projects**

</div>

## Overview

A CLI tool for interacting with Revisium instances, providing migration management, schema export, and data export capabilities.

## Features

- 🚀 **Migration Management** - Save and apply database migrations
- 📋 **Schema Export** - Export table schemas to JSON files
- 📊 **Data Export** - Export table rows to JSON files
- ⬆️ **Data Upload** - Upload table rows with dependency sorting and smart updates
- 🔧 **Flexible Configuration** - Environment variables or command-line options

## Quick Start

### Installation

```bash
# Install globally
npm install -g revisium

# Or use with npx
npx revisium --help
```

### Configuration

**All configuration parameters are optional.** The CLI provides sensible defaults and can be configured using environment variables or command-line options.

**Environment Variables (Optional):**
Create a `.env` file in your project root to set defaults:

```env
# Optional - defaults to https://cloud.revisium.io/
REVISIUM_API_URL=https://cloud.revisium.io/

# Optional - authentication credentials
REVISIUM_USERNAME=your_username
REVISIUM_PASSWORD=your_password

# Required for most operations
REVISIUM_ORGANIZATION=your_organization
REVISIUM_PROJECT=your_project

# Optional - defaults to 'master'
REVISIUM_BRANCH=master
```

**Command-line Options:**
Override environment variables with command-line options:

```bash
# Authentication options
--url http://api.example.com
--username your_username
--password your_password

# Project context options
--organization your_org
--project your_project
--branch your_branch
```

**Note:** Command-line options take precedence over environment variables.

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

# Manage migrations
revisium migrate save --file ./migrations.json
revisium migrate apply --file ./migrations.json

# Use command-line options to override environment variables
revisium schema save --folder ./schemas --url http://staging.example.com --organization my-org
```

## Commands

For detailed usage information and examples, see [CLI Usage Guide](CLI_USAGE.md).

### Available Commands

- **`migrate save`** - Export migrations from Revisium to JSON file
- **`migrate apply`** - Apply migrations from JSON file to Revisium
- **`schema save`** - Export table schemas to JSON files
- **`schema create-migrations`** - Convert schemas to migration format
- **`rows save`** - Export table data to JSON files
- **`rows upload`** - Upload table data from JSON files

### Global Options

All commands support these authentication and project options:

| Option | Environment Variable | Description | Default |
|--------|---------------------|-------------|---------|
| `--url <url>` | `REVISIUM_API_URL` | API base URL | `https://cloud.revisium.io/` |
| `--username <name>` | `REVISIUM_USERNAME` | Username | - |
| `--password <pass>` | `REVISIUM_PASSWORD` | Password | - |
| `-o, --organization <name>` | `REVISIUM_ORGANIZATION` | Organization | - |
| `-p, --project <name>` | `REVISIUM_PROJECT` | Project | - |
| `-b, --branch <name>` | `REVISIUM_BRANCH` | Branch | `master` |

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
- ⚠️  Log warnings about circular dependencies
- 💡 Suggest uploading in multiple passes or breaking the circular reference
- Continue with upload but foreign key errors may occur

## Configuration Options

### Environment Variables (Optional)
Environment variables provide convenient defaults but are not required:

```env
# API Connection - Optional with defaults
REVISIUM_API_URL=https://cloud.revisium.io/  # Default: https://cloud.revisium.io/
REVISIUM_USERNAME=your_username              # Optional: for authentication
REVISIUM_PASSWORD=your_password              # Optional: for authentication

# Project Context - Required for most operations
REVISIUM_ORGANIZATION=your_organization      # Required: target organization
REVISIUM_PROJECT=your_project                # Required: target project
REVISIUM_BRANCH=master                       # Default: 'master'
```

### Command-line Options
Override any environment variable with command-line options:

```bash
# Override API connection
revisium schema save --folder ./schemas \
  --url http://production.example.com \
  --username prod-user \
  --password prod-pass

# Override project context
revisium schema save --folder ./schemas \
  --organization acme \
  --project website \
  --branch feature-branch
```

### Authentication Flow
1. CLI checks for credentials (command-line options take precedence over environment variables)
2. If both username and password are provided, attempts authentication
3. If authentication succeeds, includes JWT token in subsequent API requests
4. If credentials are missing, continues with unauthenticated requests (may fail for private projects)

**Error Messages:**
- Missing organization: "No organization provided. Use environment variable REVISIUM_ORGANIZATION or --organization option."
- Missing project: "No project provided. Use environment variable REVISIUM_PROJECT or --project option."
- Authentication skipped: "Skipping login: username or password is missing."

**Note:** If no API URL is provided, the CLI defaults to `https://cloud.revisium.io/`.

## Development

```bash
git clone https://github.com/revisium/revisium-cli.git
cd revisium-cli
npm install
npm run build
```

## License

MIT License - see [LICENSE](LICENSE) file for details.