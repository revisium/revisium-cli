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

A CLI tool for interacting with Revisium instances, providing migration management, schema export, data export, and project synchronization capabilities.

## Features

- **Migration Management** - Save and apply database migrations with auto-commit
- **Schema Export/Import** - Export table schemas and convert to migrations
- **Data Export/Upload** - Export and upload rows with smart dependency handling
- **Patches** - Selective field updates with validation and preview
- **Project Sync** - Synchronize schema and data between Revisium projects
- **Bulk Operations** - Efficient batch operations with configurable batch size
- **Docker Deployment** - Containerized automation for CI/CD

## Installation

```bash
# Install globally
npm install -g revisium

# Or use with npx
npx revisium --help
```

## Examples

### Export & Import (File-based)

Save project to files for backup or deployment to another instance:

```bash
# Export from source
revisium migrate save --file ./migrations.json
revisium rows save --folder ./data

# Import to target
revisium migrate apply --file ./migrations.json --commit --url https://target.example.com
revisium rows upload --folder ./data --commit --url https://target.example.com
```

### Sync (Direct Transfer)

Synchronize directly between two projects without intermediate files:

```bash
revisium sync all \
  --source revisium://source.example.com/org/proj/master:head?token=xxx \
  --target revisium://target.example.com/org/proj?token=yyy \
  --commit
```

### Patches (Selective Updates)

Update specific fields without affecting other data:

```bash
revisium patches save --table Article --paths title,status --output ./patches
revisium patches preview --input ./patches
revisium patches apply --input ./patches --commit
```

## Commands

| Command | Description | Documentation |
|---------|-------------|---------------|
| `schema save` | Export table schemas to JSON files | [Schema Commands](docs/schema-commands.md) |
| `schema create-migrations` | Convert schemas to migration format | [Schema Commands](docs/schema-commands.md) |
| `migrate save` | Export migrations to JSON file | [Migrate Commands](docs/migrate-commands.md) |
| `migrate apply` | Apply migrations from JSON file | [Migrate Commands](docs/migrate-commands.md) |
| `rows save` | Export table data to JSON files | [Rows Commands](docs/rows-commands.md) |
| `rows upload` | Upload table data from JSON files | [Rows Commands](docs/rows-commands.md) |
| `patches save` | Export field values as patches | [Patches Commands](docs/patches-commands.md) |
| `patches validate` | Validate patch files | [Patches Commands](docs/patches-commands.md) |
| `patches preview` | Preview patch changes | [Patches Commands](docs/patches-commands.md) |
| `patches apply` | Apply patches to rows | [Patches Commands](docs/patches-commands.md) |
| `sync schema` | Sync schema between projects | [Sync Commands](docs/sync-commands.md) |
| `sync data` | Sync data between projects | [Sync Commands](docs/sync-commands.md) |
| `sync all` | Full sync (schema + data) | [Sync Commands](docs/sync-commands.md) |

## Configuration

Configure via environment variables or `.env` file:

```env
REVISIUM_API_URL=https://cloud.revisium.io/
REVISIUM_USERNAME=your_username
REVISIUM_PASSWORD=your_password
REVISIUM_ORGANIZATION=your_organization
REVISIUM_PROJECT=your_project
REVISIUM_BRANCH=master
```

Or use command-line options:

```bash
revisium schema save --folder ./schemas \
  --url https://api.example.com \
  --organization my-org \
  --project my-project
```

See [Configuration](docs/configuration.md) for details.

## Documentation

- [Configuration](docs/configuration.md) - Environment variables and .env files
- [URL Format](docs/url-format.md) - Revisium URL syntax
- [Authentication](docs/authentication.md) - Token, API key, and password auth
- [Schema Commands](docs/schema-commands.md) - schema save, create-migrations
- [Migrate Commands](docs/migrate-commands.md) - migrate save, apply
- [Rows Commands](docs/rows-commands.md) - rows save, upload
- [Patches Commands](docs/patches-commands.md) - patches save, validate, preview, apply
- [Sync Commands](docs/sync-commands.md) - sync schema, data, all
- [Docker Deployment](docs/docker-deployment.md) - Docker, Kubernetes, CI/CD

## Development

```bash
git clone https://github.com/revisium/revisium-cli.git
cd revisium-cli
npm install
npm run build
```

## License

MIT License - see [LICENSE](LICENSE) file for details.
