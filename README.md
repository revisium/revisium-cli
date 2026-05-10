<div align="center">

# Revisium CLI

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=revisium_revisium-cli&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=revisium_revisium-cli)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=revisium_revisium-cli&metric=coverage)](https://sonarcloud.io/summary/new_code?id=revisium_revisium-cli)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=revisium_revisium-cli&metric=bugs)](https://sonarcloud.io/summary/new_code?id=revisium_revisium-cli)
[![GitHub License](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/revisium/revisium-cli/blob/master/LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/revisium/revisium-cli)](https://github.com/revisium/revisium-cli/releases)

**Command-line interface for Revisium** — manage migrations, seed data, and move projects between instances.

</div>

## What is Revisium?

A versioned headless CMS / data platform with Git-like branches and revisions. See [revisium.io](https://revisium.io) and [docs.revisium.io](https://docs.revisium.io) for the product reference.

This CLI wraps the Revisium HTTP API for everyday CI/CD and developer flows.

## Install

```bash
npm install -g revisium      # global
npx revisium --help          # ad-hoc
```

## Quickstart (60 seconds, local)

```bash
# 1. Boot a local Revisium with embedded PostgreSQL in another terminal.
#    No --auth flag = no credentials needed for the rest of this quickstart.
npx -y @revisium/standalone

# 2. Grab the example bootstrap config (or write your own — see docs/quickstart.md).
curl -O https://raw.githubusercontent.com/revisium/revisium-cli/master/examples/quickstart/bootstrap.config.json

# 3. Bootstrap a project + table + row + REST endpoint.
revisium example bootstrap \
  --config ./bootstrap.config.json \
  --url revisium://localhost:9222/admin/hello/master \
  --commit

# 4. Hit your fresh REST endpoint.
curl http://localhost:9222/endpoint/rest/admin/hello/master/draft/Note/first
```

Full walkthrough: [docs/quickstart.md](docs/quickstart.md). For a Revisium that requires login, see [docs/authentication.md](docs/authentication.md).

## Use cases

- **Manage migrations and seeding in CI/CD** — `migrate save/apply` plus `rows upload` for seed data, driven from a JSON file in git. Walk: [docs.revisium.io/migrations/ci-cd](https://docs.revisium.io/migrations/ci-cd).
- **Sync between live instances** — `sync schema/data/all` copies a project directly between two Revisium instances without intermediate files. Walk: [docs/workflows.md#2-sync-between-two-live-instances](docs/workflows.md#2-sync-between-two-live-instances).
- **Download / upload (data portability)** — `schema save` / `rows save` / `migrate save` export to JSON; `migrate apply` / `rows upload` import. Useful for backups, fixtures, and air-gapped transfers. Walk: [docs/workflows.md#3-download--upload-data-portability](docs/workflows.md#3-download--upload-data-portability).

## Commands

| Command                               | Description                            | Documentation                                    |
| ------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| `migrate save`                        | Export migrations to JSON file         | [Migrate Commands](docs/migrate-commands.md)     |
| `migrate apply`                       | Apply migrations from JSON file        | [Migrate Commands](docs/migrate-commands.md)     |
| `schema save`                         | Export table schemas to JSON files     | [Schema Commands](docs/schema-commands.md)       |
| `schema create-migrations`            | Convert schemas to migration format    | [Schema Commands](docs/schema-commands.md)       |
| `rows save`                           | Export table data to JSON files        | [Rows Commands](docs/rows-commands.md)           |
| `rows upload`                         | Upload table data from JSON files      | [Rows Commands](docs/rows-commands.md)           |
| `sync schema`                         | Sync schema between projects           | [Sync Commands](docs/sync-commands.md)           |
| `sync data`                           | Sync data between projects             | [Sync Commands](docs/sync-commands.md)           |
| `sync all`                            | Full sync (schema + data)              | [Sync Commands](docs/sync-commands.md)           |
| `project ensure`                      | Ensure a project and branch exist      | [Bootstrap Commands](docs/bootstrap-commands.md) |
| `endpoint ensure/list`                | Ensure or list generated endpoints     | [Bootstrap Commands](docs/bootstrap-commands.md) |
| `example bootstrap`                   | Bootstrap a project from config        | [Bootstrap Commands](docs/bootstrap-commands.md) |
| `auth login/status/logout`            | Manage saved API-key credentials       | [Authentication](docs/authentication.md)         |
| `instance add/list/show/remove`       | Manage workspace Revisium instances    | [Workspace Config](docs/workspace-config.md)     |
| `context create/list/show/use/remove` | Manage workspace Revisium contexts     | [Workspace Config](docs/workspace-config.md)     |

## Configuration

Pick the auth method that matches the context:

- **Saved API key** — recommended for local dev. Run `revisium auth login` once; the key lives in the OS keyring and is reused automatically.
- **Environment variables** — recommended for CI. `REVISIUM_TOKEN` (or `REVISIUM_API_KEY`) plus `REVISIUM_URL`.
- **Workspace contexts** — for multi-target setups. `revisium instance add` and `revisium context create` save non-secret config under `.revisium/revisium-cli.config.json`.

Full precedence rules and every supported method: [docs/authentication.md](docs/authentication.md), [docs/configuration.md](docs/configuration.md).

## Documentation

- [Quickstart](docs/quickstart.md) — run the CLI against a local Revisium in five minutes.
- [Concepts](docs/concepts.md) — primitives the CLI works with.
- [Common workflows](docs/workflows.md) — named recipes (CI/CD, sync, portability).
- [Authentication](docs/authentication.md) · [Configuration](docs/configuration.md) · [URL Format](docs/url-format.md) · [Workspace Config](docs/workspace-config.md)
- Per-command: [migrate](docs/migrate-commands.md) · [schema](docs/schema-commands.md) · [rows](docs/rows-commands.md) · [sync](docs/sync-commands.md) · [bootstrap](docs/bootstrap-commands.md)
- [Docker deployment](docs/docker-deployment.md)
- Product docs: [docs.revisium.io](https://docs.revisium.io)

## Compatibility

The current CLI targets `@revisium/standalone` 2.8.x and current `cloud.revisium.io`.

## Development

```bash
git clone https://github.com/revisium/revisium-cli.git
cd revisium-cli
npm install
npm run build
```

Conventions and the verify checklist for contributors are in [AGENTS.md](AGENTS.md).

## License

MIT — see [LICENSE](LICENSE).
