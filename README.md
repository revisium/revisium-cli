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

Create a `.env` file in your project root:

```env
REVISIUM_API_URL=http://localhost:8080
REVISIUM_USERNAME=your_username
REVISIUM_PASSWORD=your_password
REVISIUM_ORGANIZATION=your_organization
REVISIUM_PROJECT=your_project
REVISIUM_BRANCH=master
```

### Basic Usage

```bash
# View all available commands
revisium --help

# Export table schemas
revisium schema save --folder ./schemas

# Export table data
revisium rows save --folder ./data

# Upload table data  
revisium rows upload --folder ./data

# Manage migrations
revisium migrate save --file ./migrations.json
revisium migrate apply --file ./migrations.json
```

## Commands

### Migration Commands

#### `migrate save`
Export migrations to a JSON file.

```bash
revisium migrate save --file ./migrations.json [options]
```

**Options:**

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-f, --file <path>` | Output file path | ✓ | - |
| `-o, --organization <name>` | Organization name | - | `$REVISIUM_ORGANIZATION` |
| `-p, --project <name>` | Project name | - | `$REVISIUM_PROJECT` |
| `-b, --branch <name>` | Branch name | - | `$REVISIUM_BRANCH` |

#### `migrate apply`
Apply migrations from a JSON file.

```bash
revisium migrate apply --file ./migrations.json [options]
```

**Options:**

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-f, --file <path>` | Input file path | ✓ | - |
| `-o, --organization <name>` | Organization name | - | `$REVISIUM_ORGANIZATION` |
| `-p, --project <name>` | Project name | - | `$REVISIUM_PROJECT` |
| `-b, --branch <name>` | Branch name | - | `$REVISIUM_BRANCH` |

### Schema Commands

#### `schema save`
Export table schemas to JSON files.

```bash
revisium schema save --folder ./schemas [options]
```

**Options:**

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-f, --folder <path>` | Output folder path | ✓ | - |
| `-o, --organization <name>` | Organization name | - | `$REVISIUM_ORGANIZATION` |
| `-p, --project <name>` | Project name | - | `$REVISIUM_PROJECT` |
| `-b, --branch <name>` | Branch name | - | `$REVISIUM_BRANCH` |

**Output:**
```
schemas/
├── table-1.json
├── table-2.json
└── table-n.json
```

#### `schema create-migrations`
Convert saved schemas to migration files.

```bash
revisium schema create-migrations --schemas-folder ./schemas --file ./migrations.json
```

**Options:**

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `--schemas-folder <path>` | Folder containing schema JSON files | ✓ | - |
| `-f, --file <path>` | Output file for generated migrations | ✓ | - |

**Features:**
- **Dependency Analysis**: Automatically analyzes table dependencies based on foreign keys
- **Topological Sorting**: Orders migrations to respect foreign key constraints
- **Circular Dependency Detection**: Warns about circular dependencies
- **Schema Validation**: Validates generated migrations against JSON schema
- **Unique Timestamps**: Generates unique ISO date strings for migration IDs
- **Hash Generation**: Creates SHA256 hashes for schema integrity

**Example Workflow:**
```bash
# 1. Export schemas from Revisium
revisium schema save --folder ./schemas

# 2. Convert schemas to migrations
revisium schema create-migrations --schemas-folder ./schemas --file ./migrations.json

# 3. Apply migrations to another environment
revisium migrate apply --file ./migrations.json
```

### Rows Commands

#### `rows save`
Export table rows to JSON files.

```bash
revisium rows save --folder ./data [options]
```

**Options:**

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-f, --folder <path>` | Output folder path | ✓ | - |
| `-t, --tables <ids>` | Comma-separated table IDs | - | All tables |
| `-o, --organization <name>` | Organization name | - | `$REVISIUM_ORGANIZATION` |
| `-p, --project <name>` | Project name | - | `$REVISIUM_PROJECT` |
| `-b, --branch <name>` | Branch name | - | `$REVISIUM_BRANCH` |

**Examples:**
```bash
# Export all tables
revisium rows save --folder ./data

# Export specific tables
revisium rows save --folder ./data --tables users,posts,comments

# Override project settings
revisium rows save --folder ./data --project my-project --branch dev
```

**Output:**
```
data/
├── users/
│   ├── user-123.json
│   ├── user-456.json
│   └── ...
├── posts/
│   ├── post-789.json
│   └── ...
└── comments/
    ├── comment-def.json
    └── ...
```

#### `rows upload`
Upload table rows from JSON files to Revisium.

```bash
revisium rows upload --folder ./data [options]
```

**Options:**

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-f, --folder <path>` | Folder path containing row files | ✓ | - |
| `-t, --tables <ids>` | Comma-separated table IDs | - | All tables found in folder |
| `-o, --organization <name>` | Organization name | - | `$REVISIUM_ORGANIZATION` |
| `-p, --project <name>` | Project name | - | `$REVISIUM_PROJECT` |
| `-b, --branch <name>` | Branch name | - | `$REVISIUM_BRANCH` |

**Examples:**
```bash
# Upload all tables from folder
revisium rows upload --folder ./data

# Upload specific tables only
revisium rows upload --folder ./data --tables users,posts,comments

# Override project settings
revisium rows upload --folder ./data --project my-project --branch dev
```

**Features:**
- **Schema Validation**: Validates data fields against table schema
- **Smart Upload**: Creates new rows or updates changed rows
- **Duplicate Detection**: Skips rows with identical data
- **Dependency Sorting**: Automatically sorts tables by foreign key dependencies
- **Circular Dependency Detection**: Warns about circular foreign key references
- **Statistics Reporting**: Shows uploaded/updated/skipped/error counts
- **Folder Structure**: Uses same structure as `rows save` command

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

## Configuration

Create a `.env` file:

```env
REVISIUM_API_URL=http://localhost:8080
REVISIUM_USERNAME=your_username  
REVISIUM_PASSWORD=your_password
REVISIUM_ORGANIZATION=your_organization
REVISIUM_PROJECT=your_project
REVISIUM_BRANCH=master
```

You can also use command-line options:

```bash
revisium schema save --folder ./schemas --organization acme --project website
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