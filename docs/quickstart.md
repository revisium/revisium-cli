# Quickstart

Boots a local Revisium, creates a project with a table and a row, and exposes it as a REST endpoint — all from the CLI. Should take under five minutes from a clean checkout.

## Prerequisites

- Node.js 20 or later.
- A free terminal window for the local Revisium server.

The CLI itself is `npx`-friendly, so you don't need to install it globally to follow along.

## 1. Boot a local Revisium

In one terminal:

```bash
npx -y @revisium/standalone --auth
```

`@revisium/standalone` is a self-contained Revisium with embedded PostgreSQL. The first run prints an admin password — copy it. Subsequent runs print the bound URL (default: `http://localhost:9222`).

Leave this terminal running.

## 2. Save your API key

In a second terminal, log in once. The CLI stores the key in your OS keyring so later commands don't need it again:

```bash
# Open Revisium's UI in a browser, sign in with the admin password, and mint
# a personal API key under "API Keys". Then:
revisium auth login \
  --url revisium://localhost:9222 \
  --api-key-stdin
# (paste the API key, then Enter)
```

`revisium auth status --url revisium://localhost:9222` will confirm the credential is saved.

## 3. Bootstrap a project

Save this as `bootstrap.config.json`:

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
  "commitMessage": "Initial bootstrap"
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

## 4. Hit the REST endpoint

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
revisium instance add local --url revisium://localhost:9222
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
