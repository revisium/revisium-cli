# Quickstart

Boots a local Revisium with no authentication, creates a project with a table and a row, and exposes it as a REST endpoint — all from the CLI. Should take under five minutes from a clean checkout.

## Prerequisites

- Node.js 20 or later.
- A free terminal window for the local Revisium server.

The CLI itself is `npx`-friendly, so you don't need to install it globally to follow along.

## 1. Boot a local Revisium (no-auth)

In one terminal:

```bash
npx -y @revisium/standalone
```

`@revisium/standalone` is a self-contained Revisium with embedded PostgreSQL. Without the `--auth` flag it runs in **no-auth mode**: anyone hitting `http://localhost:9222` can read and write. Perfect for kicking the tires; do not expose this to the internet.

Leave this terminal running. The bound URL appears in the banner once startup finishes.

For the auth-enabled path (`--auth` plus `revisium auth login`), see [docs/authentication.md](authentication.md).

## 2. Bootstrap a project

Grab the example config from this repo:

```bash
curl -O https://raw.githubusercontent.com/revisium/revisium-cli/master/examples/quickstart/bootstrap.config.json
```

Or write your own — full schema in [bootstrap commands](bootstrap-commands.md#config-schema). For reference, the file you just downloaded:

```json
{
  "projectName": "hello",
  "branchName": "master",
  "endpoints": ["REST_API"],
  "tables": [
    {
      "id": "Note",
      "schema": {
        "type": "object",
        "required": ["text"],
        "additionalProperties": false,
        "properties": {
          "text": { "type": "string", "default": "" }
        }
      }
    }
  ],
  "rows": [
    { "tableId": "Note", "rowId": "first", "data": { "text": "hi" } }
  ],
  "commitMessage": "Quickstart bootstrap"
}
```

Run it:

```bash
revisium example bootstrap \
  --config ./bootstrap.config.json \
  --url revisium://localhost:9222/admin/hello/master \
  --commit
```

The CLI:

1. Creates the `hello` project (idempotent — re-runs report `skipped`).
2. Creates the `Note` table with the JSON Schema above.
3. Creates a `first` row.
4. Generates a `REST_API` endpoint pointing at the new revision.
5. Commits the draft, sealing the revision.

## 3. Hit the REST endpoint

```bash
curl http://localhost:9222/endpoint/rest/admin/hello/master/draft/Note/first
```

Expected response:

```json
{ "text": "hi" }
```

You're done. The same shape — bootstrap config + example bootstrap command — scales up to many tables, rows, and endpoints.

## Optional: pin the workspace

If you'll keep running the CLI in this directory, add a workspace context so commands can omit `--url`:

```bash
# --auth none matches the standalone we booted in step 1
revisium instance add local --url revisium://localhost:9222 --auth none
revisium context create hello-local \
  --url revisium://localhost:9222/admin/hello/master
revisium context use hello-local

# Subsequent commands resolve the target from the current context
revisium project ensure --json
revisium endpoint list --json
```

`.revisium/revisium-cli.config.json` is non-secret and safe to commit when shared by a team.

## Next

- [Concepts](concepts.md) — what the primitives mean.
- [Common workflows](workflows.md) — migrations + seeding, sync, portability.
- [Authentication](authentication.md) — all supported auth methods.
- [Bootstrap commands](bootstrap-commands.md) — full `bootstrap.config.json` schema and command flags.
