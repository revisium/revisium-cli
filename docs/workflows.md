# Common workflows

Three named recipes for the things teams use the CLI for in production. Each one is the runnable command sequence; deeper detail lives in the per-command docs.

## 1. Manage migrations and seeding in CI/CD

The canonical flow: schema changes are made in dev, exported to JSON, committed to git, then applied through staging and prod by an automated pipeline. **The full walk-through lives in the product docs at [docs.revisium.io/migrations/ci-cd](https://docs.revisium.io/migrations/ci-cd).**

CLI summary:

```bash
# 1. In dev, after editing schema in the UI:
revisium migrate save --file ./revisium/migrations.json \
  --url revisium://localhost:9222/myorg/myproject/master

# (optional) export seed data
revisium rows save --folder ./revisium/data \
  --url revisium://localhost:9222/myorg/myproject/master

git add revisium/ && git commit -m "Add new schema fields"

# 2. In CI, against an environment:
export REVISIUM_TOKEN=$STAGING_TOKEN
revisium migrate apply --file ./revisium/migrations.json --commit \
  --url revisium://staging.example.com/myorg/myproject/master

# (optional) seed data on first deploy
revisium rows upload --folder ./revisium/data --commit \
  --url revisium://staging.example.com/myorg/myproject/master
```

Key flags:

- `--commit` seals a new revision after the apply / upload finishes.
- `--create-project` on `migrate apply` creates the project if it doesn't exist (useful for ephemeral preview environments).

In CI, prefer `REVISIUM_TOKEN` (env) over `?token=` in the URL — token doesn't end up in shell history or process listings.

See [migrate commands](migrate-commands.md) and [docs.revisium.io/migrations/ci-cd](https://docs.revisium.io/migrations/ci-cd).

## 2. Sync between two live instances

Direct project-to-project transfer with no intermediate files. Useful for refreshing staging from prod, or copying a fixture project across regions.

```bash
export REVISIUM_SOURCE_TOKEN=$PROD_READ_TOKEN
export REVISIUM_TARGET_TOKEN=$STAGING_WRITE_TOKEN

# Schema only
revisium sync schema \
  --source revisium://prod.example.com/myorg/myproject/master:head \
  --target revisium://staging.example.com/myorg/myproject/master \
  --commit

# Schema + data
revisium sync all \
  --source revisium://prod.example.com/myorg/myproject/master:head \
  --target revisium://staging.example.com/myorg/myproject/master \
  --commit
```

Notes:

- The source target should usually point at `:head` (a sealed revision); the target writes to `:draft` and `--commit` seals the result.
- `sync data` skips schema differences — run `sync schema` first when schemas have drifted.
- Per-side env vars (`REVISIUM_SOURCE_*` / `REVISIUM_TARGET_*`) take precedence over the generic `REVISIUM_*` ones.

See [sync commands](sync-commands.md).

## 3. Download / upload (data portability)

File-based variant of the same idea — useful for backups, fixtures stored in git, or transferring through environments without direct network access.

```bash
# Download (export) from one instance:
revisium migrate save --file ./out/migrations.json   # schema as migrations
revisium schema  save --folder ./out/schemas         # raw JSON schemas
revisium rows    save --folder ./out/data            # row data

# Upload (import) to another instance:
revisium migrate apply  --file ./out/migrations.json --commit
revisium rows    upload --folder ./out/data        --commit
```

Variants:

- `schema save` + `schema create-migrations` is the offline path: read schemas from JSON files and produce a migration JSON without touching the network. Use it when you author schema in editor tooling instead of the UI.
- `--batch-size <n>` on `rows upload` keeps memory bounded for large fixtures.
- For a one-off bootstrap (project + tables + rows + endpoints from a single config), see `example bootstrap` in [bootstrap commands](bootstrap-commands.md).

See [schema commands](schema-commands.md), [rows commands](rows-commands.md), and [migrate commands](migrate-commands.md).

## When to pick which

| Scenario                                                  | Use                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| Schema lives in code, prod is the next stop after staging | **Migrations in CI/CD** — git is the source of truth                 |
| Refresh non-prod from prod, prod stays canonical          | **Sync** — direct, no intermediate files                             |
| Snapshot data for git, compliance, or air-gapped transfer | **Download / upload** — file-based                                   |
| First-time setup of a brand-new project                   | **`example bootstrap`** — one config file, idempotent                |
