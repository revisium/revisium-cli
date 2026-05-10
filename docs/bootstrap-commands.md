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

### Config schema

`bootstrap.config.json` describes a complete project bootstrap. All fields are optional except where marked.

| Field           | Type                       | Notes                                                                                       |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| `projectName`   | string                     | Asserted against the target URL's `<project>` segment when set; mismatches fail fast.       |
| `branchName`    | string                     | Same idea for the branch segment.                                                           |
| `endpoints`     | array of `"REST_API"` / `"GRAPHQL"` | Endpoints to ensure on the target revision. `--endpoint` flags override this array. |
| `tables`        | array of `{ id, schema }`  | `id`: non-empty string; `schema`: a JSON Schema object (`type: "object"` with properties).  |
| `rows`          | array of `{ tableId, rowId, data }` | All three fields required and non-empty; `data` must be an object.                 |
| `commitMessage` | string                     | Used as the revision message when `--commit` is passed.                                     |

A complete example:

```json
{
  "projectName": "dictionary",
  "branchName": "master",
  "endpoints": ["REST_API", "GRAPHQL"],
  "tables": [
    {
      "id": "FaqCategory",
      "schema": {
        "type": "object",
        "required": ["name"],
        "additionalProperties": false,
        "properties": {
          "name": { "type": "string", "default": "" },
          "summary": { "type": "string", "default": "" }
        }
      }
    }
  ],
  "rows": [
    {
      "tableId": "FaqCategory",
      "rowId": "billing",
      "data": { "name": "Billing", "summary": "Payments and invoices" }
    }
  ],
  "commitMessage": "Bootstrap dictionary example"
}
```

Notes on table schemas:

- Revisium accepts JSON Schema with `type: "object"` at the root.
- Use `type: "number"` for numeric fields — `type: "integer"` is rejected as "this type is not allowed".
- `additionalProperties: false` and per-property `default` values are recommended; rows lacking a field will fail validation otherwise.

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
