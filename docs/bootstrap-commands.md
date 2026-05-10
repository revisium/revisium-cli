# Bootstrap Commands

Bootstrap commands help example repositories create the Revisium resources they need without custom Node scripts.

## Project Ensure

```bash
revisium project ensure \
  --url revisium://localhost:9222/admin/dictionary/master
```

Behavior:

- Creates the project when it is missing.
- Creates the target branch when the project exists but the branch is missing.
- Exits successfully when both project and branch already exist.
- Uses the Revisium URL format by default.
- Supports `--dry-run` and `--json` for scripted setup.

You can also use a workspace context:

```bash
revisium project ensure --context dictionary-local
```

## Endpoint Ensure

```bash
revisium endpoint ensure \
  --url revisium://localhost:9222/admin/dictionary/master \
  --type REST_API

revisium endpoint ensure \
  --url revisium://localhost:9222/admin/dictionary/master \
  --type GRAPHQL
```

Behavior:

- Creates the endpoint when the selected revision does not already have one of that type.
- Skips existing endpoints, so reruns do not create duplicates.
- Prints endpoint id, type, selected revision, and a best-effort URL hint.
- Supports `--dry-run` and `--json` for scripted setup.

List endpoints:

```bash
revisium endpoint list --url revisium://localhost:9222/admin/dictionary/master
revisium endpoint list --url revisium://localhost:9222/admin/dictionary/master --json
```

## Example Bootstrap

```bash
revisium example bootstrap \
  --config ./bootstrap.config.json \
  --url revisium://localhost:9222/admin/dictionary/master \
  --commit
```

Config shape:

```json
{
  "projectName": "dictionary",
  "branchName": "master",
  "endpoints": ["REST_API", "GRAPHQL"],
  "tables": [
    { "id": "FaqCategory", "schema": { "type": "object" } }
  ],
  "rows": [
    { "tableId": "FaqCategory", "rowId": "billing", "data": { "name": "Billing" } }
  ],
  "commitMessage": "Bootstrap dictionary example"
}
```

Behavior:

- Ensures the project and branch exist.
- Creates missing tables.
- Creates missing rows.
- Creates missing endpoints.
- Skips resources that already exist with matching content.
- Stops on existing tables or rows with different content. Updates to existing resources are intentionally out of scope.
- Commits only when `--commit` is passed.

Useful options:

```bash
# Plan without writing
revisium example bootstrap --config ./bootstrap.config.json --url revisium://localhost:9222/admin/dictionary/master --dry-run

# JSON summary for CI
revisium example bootstrap --config ./bootstrap.config.json --url revisium://localhost:9222/admin/dictionary/master --json

# Override configured endpoints for one run
revisium example bootstrap \
  --config ./bootstrap.config.json \
  --url revisium://localhost:9222/admin/dictionary/master \
  --endpoint REST_API \
  --endpoint GRAPHQL
```

When `--endpoint` is provided at least once, the repeated flags replace the `endpoints` array from the config for that run.
