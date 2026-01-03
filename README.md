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

### CI/CD Migrations (Prisma-like Workflow)

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│    DEV      │      │    GIT      │      │   CI/CD     │
│             │      │             │      │             │
│  Revisium   │ save │ migrations  │ push │   apply     │
│    UI       │─────▶│   .json     │─────▶│  migrations │
│             │      │   data/     │      │   + seed    │
└─────────────┘      └─────────────┘      └─────────────┘
```

Like Prisma, save schema migrations locally and apply them in CI/CD:

```bash
# 1. Save migrations locally (during development)
revisium migrate save --file ./revisium/migrations.json \
  --url revisium://admin:admin@localhost:8080/myorg/myproject/master

# 2. Commit to git
git add revisium/migrations.json
git commit -m "Add new schema fields"

# 3. Apply in CI/CD (on deploy)
revisium migrate apply --file ./revisium/migrations.json --commit \
  --url revisium://cloud.revisium.io/myorg/myproject/master
```

Add to package.json scripts:

```json
{
  "scripts": {
    "revisium:save-migrations": "revisium migrate save --file ./revisium/migrations.json",
    "revisium:apply-migrations": "revisium migrate apply --file ./revisium/migrations.json --commit",
    "start:prod": "npm run revisium:apply-migrations && node dist/main"
  }
}
```

See [Docker Deployment](docs/docker-deployment.md) for complete CI/CD examples.

### Export & Import (File-based)

```
┌─────────────┐                          ┌─────────────┐
│   SOURCE    │    migrations.json       │   TARGET    │
│  Revisium   │ ────────────────────▶    │  Revisium   │
│             │        data/             │             │
└─────────────┘                          └─────────────┘
```

Save project to files for backup or deployment to another instance:

```bash
# Export from source
revisium migrate save --file ./migrations.json
revisium rows save --folder ./data

# Import to target
revisium migrate apply --file ./migrations.json --commit \
  --url revisium://target.example.com/org/proj/main
revisium rows upload --folder ./data --commit \
  --url revisium://target.example.com/org/proj/master
```

### Sync (Direct Transfer)

```
┌─────────────┐                          ┌─────────────┐
│   SOURCE    │    schema + data         │   TARGET    │
│  Revisium   │ ════════════════════▶    │  Revisium   │
│             │       (direct)           │   :draft    │
└─────────────┘                          └─────────────┘
```

Synchronize directly between two projects without intermediate files:

```bash
revisium sync all \
  --source revisium://source.example.com/org/proj/master:head?token=xxx \
  --target revisium://target.example.com/org/proj?token=yyy \
  --commit
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
| `sync schema` | Sync schema between projects | [Sync Commands](docs/sync-commands.md) |
| `sync data` | Sync data between projects | [Sync Commands](docs/sync-commands.md) |
| `sync all` | Full sync (schema + data) | [Sync Commands](docs/sync-commands.md) |

## Configuration

Configure via environment variables or `.env` file:

```env
REVISIUM_URL=revisium://cloud.revisium.io/your_org/your_project/main
REVISIUM_USERNAME=your_username
REVISIUM_PASSWORD=your_password
```

Or use command-line options with URL:

```bash
revisium schema save --folder ./schemas \
  --url revisium://cloud.revisium.io/my-org/my-project/develop?token=$TOKEN
```

See [Configuration](docs/configuration.md) and [URL Format](docs/url-format.md) for details.

## Documentation

- [Configuration](docs/configuration.md) - Environment variables and .env files
- [URL Format](docs/url-format.md) - Revisium URL syntax
- [Authentication](docs/authentication.md) - Token, API key, and password auth
- [Schema Commands](docs/schema-commands.md) - schema save, create-migrations
- [Migrate Commands](docs/migrate-commands.md) - migrate save, apply
- [Rows Commands](docs/rows-commands.md) - rows save, upload
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
