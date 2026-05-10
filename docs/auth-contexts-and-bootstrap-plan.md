# Auth Contexts And Bootstrap Plan

Status: Active implementation tracker

## Problem

Revisium CLI currently resolves connection details from `--url`, environment variables, `.env`, or interactive prompts. That works for short scripts, but it is weak for repeated local use and for examples:

- API keys cannot be saved and reused safely.
- Multiple Revisium instances need repeated URL and credential setup.
- Commands cannot rely on a named active context.
- Missing connection data can unexpectedly trigger prompts in non-interactive environments.
- `revisium-examples` still needs custom Node scripts to create projects, seed data, and create generated endpoints.

## Current Implementation Snapshot

This document started as a forward-looking plan. Keep this section updated as each phase lands so the next implementation step is visible from `master`.

| Area | Status | Notes |
| --- | --- | --- |
| Workspace config path | Done | The CLI uses nearest `.revisium/revisium-cli.config.json`; there is no home-level CLI config. |
| Instance commands | Done | `instance add/list/show/remove` manage non-secret workspace instance aliases. |
| Context commands | Done | `context create/list/show/use/remove` manage default workspace targets and `currentContext`. |
| Workspace target resolution | Done | Single-target commands can use `--context` or current workspace context when `--url` / `REVISIUM_URL` are absent. |
| Explicit no-auth mode | Done | `authMode: "none"` supports local standalone examples without credentials. |
| Stored auth mode shape | Partial | `authMode: "stored"` and optional context `credential` are reserved, but saved credentials are not implemented yet. |
| Auth commands | Not started | `auth login/status/logout` still need an OS credential-store backed implementation. |
| Credential-store abstraction | Not started | Needed before saving API keys or OAuth refresh material. |
| Shared client error/ensure helpers | Not started | `@revisium/client` still needs reusable structured errors and idempotent ensure helpers. |
| Project and endpoint ensure commands | Not started | `project ensure`, `endpoint ensure`, and `endpoint list` are still planned CLI work. |
| Example bootstrap command | Not started | `example bootstrap` remains planned and should be added after or with reusable ensure helpers. |
| Common output flags | Partial | `--context` exists for single-target commands; `--json`, `--quiet`, and `--no-input` still need consistent command-wide behavior. |
| `revisium-examples` adoption | Blocked | Wait for released CLI support before replacing custom bootstrap scripts. |

Recommended next PR sequence:

1. Finish credential foundation in `revisium-cli`: credential-store abstraction plus `auth login/status/logout` for API keys.
2. Add reusable structured errors and idempotent ensure helpers in `@revisium/client`.
3. Add `project ensure`, `endpoint ensure/list`, and `example bootstrap` in `revisium-cli`, using client helpers where available.
4. Update `revisium-examples` after the CLI commands are released.

## Goals

- Save reusable, non-secret Revisium instance and context configuration in the workspace.
- Save secrets such as API keys outside the repo, preferably in the operating system credential store.
- Support multiple instances, projects, and one active context per workspace.
- Support explicit no-auth workspace config for local standalone examples.
- Keep CI explicit and non-interactive.
- Add idempotent project, endpoint, and example bootstrap workflows.
- Keep reusable API behavior in `@revisium/client` where it also benefits scripts and examples.

## Non-Goals

- Do not store API keys in project files, shell history, or `revisium://...?apikey=...` config.
- Do not make username/password the primary cloud auth story.
- Do not replace the existing `--url` and environment variable flow.
- Do not require a saved context for CI.
- Do not add a separate user-level CLI config file in the first implementation.

## Proposed User Model

Use three related concepts:

| Concept | Meaning | Secret? | Example |
| --- | --- | --- | --- |
| Instance | Revisium server location | No | `local` -> `revisium://localhost:9222` |
| Credential | Auth material for an instance | Yes | API key, OAuth refresh token |
| Context | Default target path | No | `local/admin/dictionary/master:draft` |

Instances and contexts are stored in the workspace config. Credentials are stored outside the workspace in the OS credential store.

Example setup:

```bash
revisium instance add local --url revisium://localhost:9222 --auth none
revisium context create dictionary-local --url revisium://localhost:9222/admin/dictionary/master
revisium context use dictionary-local
```

These commands operate on the current workspace config.

Then normal commands can omit `--url`:

```bash
revisium endpoint ensure --type REST_API
revisium example bootstrap --config ./bootstrap.config.json --commit
```

## Configuration Storage

Use one non-secret workspace config file for the initial implementation:

```text
<workspace>/.revisium/revisium-cli.config.json
```

This is the only instance/context config file in this plan. It stores instance aliases, context aliases, and the active workspace context. It must not store API keys, OAuth refresh tokens, passwords, or `revisium://...?token=...` URLs.

The CLI should discover the file by walking up from the current working directory to the nearest `.revisium/revisium-cli.config.json`. Commands that create workspace config should write to `./.revisium/revisium-cli.config.json` when no existing config is found. Commands that intentionally work outside a workspace should continue to use `--url` or environment variables.

Projects may commit this file when it contains only non-secret settings. `revisium-examples` should commit it with `authMode: "none"` for local standalone demos so examples can run without custom auth scripts.

Use `.revisium` because the settings describe the Revisium target and bootstrap behavior for that workspace. Use `revisium-cli.config.json` because the file belongs to this CLI and should not collide with future Revisium project metadata. The same relative path is valid on Windows and Unix even though hidden-directory conventions differ.

Shape:

```json
{
  "version": 1,
  "currentContext": "dictionary-local",
  "instances": {
    "local": {
      "baseUrl": "http://localhost:9222",
      "authMode": "none"
    },
    "cloud": {
      "baseUrl": "https://cloud.revisium.io",
      "authMode": "stored"
    }
  },
  "contexts": {
    "dictionary-local": {
      "instance": "local",
      "organization": "admin",
      "project": "dictionary",
      "branch": "master",
      "revision": "draft"
    },
    "cloud-admin": {
      "instance": "cloud",
      "credential": "admin",
      "organization": "admin",
      "project": "dictionary",
      "branch": "master",
      "revision": "draft"
    }
  }
}
```

The config file may store normalized HTTP(S) `baseUrl` values internally, but user-facing commands and documentation should prefer the existing `revisium://host/org/project/branch[:revision]` format. Raw HTTP(S) URLs are still useful internally and for server/OAuth calls, but they should not become the primary operator-facing target format.

`authMode` is explicit:

- `none` sends no auth and bypasses the credential store. Use it for local standalone examples that run with auth disabled.
- `stored` uses the OS credential store unless explicit auth flags, URL auth, or environment credentials are provided.

Standalone note: `@revisium/standalone` uses `~/.revisium` for embedded PostgreSQL, uploads, and generated local secrets. The CLI config is workspace-relative, so standalone data resets do not affect it.

Secrets should live in the OS credential store under a stable key, for example:

```text
service: revisium-cli
account: instance:https://cloud.revisium.io|credential:admin
secret: {"method":"apikey","apiKey":"rev_..."}
```

Credential-store keys should use the normalized instance base URL plus a credential name, not the workspace-local instance alias, because aliases such as `local` are not globally unique across workspaces. Contexts may set `credential` to select a named credential. If `credential` is omitted, use `default`. If the selected saved credential does not exist and no explicit/env auth was provided, fail with a remediation message.

If no credential store is available, fail only when the resolved auth flow needs to save or load a stored credential. Explicit auth flags, URL auth, environment credentials, and `authMode: "none"` bypass credential-store checks. Do not add plaintext credential fallback in the first implementation; if it is added later, reserve the explicit flag name `--allow-insecure-credential-storage`, print a prominent warning, and never write secrets into `.revisium/revisium-cli.config.json`.

## Resolution Order

Commands should resolve connection and auth data in this order:

1. Command flags: `--url`, `--context`, `--api-key`, `--token`.
2. Environment variables for the existing CLI contract.
3. Workspace config from the nearest `.revisium/revisium-cli.config.json`.
4. Saved credential from the OS credential store when the selected instance uses `authMode: "stored"`.
5. Interactive prompts, only when stdin is a TTY and `--no-input` is not set.

There is no global config fallback in the first implementation. Discovery starts in the current directory, checks `./.revisium/revisium-cli.config.json`, then walks parent directories until it finds a workspace config or reaches the filesystem root.

When a command needs a Revisium target, `--url` should mean the existing Revisium URL format by default:

```text
revisium://host/org/project/branch[:revision]
```

Commands may accept HTTP(S) base URLs where that is explicitly a server-only operation, but target selection should stay centered on `revisium://`.

Target flags and auth flags have separate jobs. `--url` and `--context` select the Revisium target. `--token`, `--api-key`, and `--api-key-stdin` select the credential for that target and should not change the target path.

The saved-context flow must not change existing auth precedence. For single-endpoint commands, preserve:

1. Explicit auth flags: `--token`, `--api-key`, and `--api-key-stdin` where supported.
2. URL auth: `?token=...`, `?apikey=...`, or `user:password@host`.
3. Environment auth: `REVISIUM_TOKEN` > `REVISIUM_API_KEY` > `REVISIUM_USERNAME` / `REVISIUM_PASSWORD`.
4. `authMode: "none"` for the resolved instance.
5. Saved credential for the resolved instance/context.
6. Interactive auth prompt.

For example, `--api-key` with `--context dictionary-local` uses the named context as the target and the explicit API key as the credential. `--token` with `--url revisium://host/org/project/master` uses the URL target and the explicit token as the credential.

Credential-store unavailability should fail only when this precedence reaches a saved credential. `--api-key`, `--token`, `--api-key-stdin`, `REVISIUM_API_KEY`, and `REVISIUM_TOKEN` must not fail just because a credential store is unavailable. In CI or `--no-input`, a missing required saved credential or unavailable credential store must fail fast with remediation.

For sync commands, preserve the source/target variants before falling back to saved credentials:

| Endpoint | URL | Token | API key | Username | Password |
| --- | --- | --- | --- | --- | --- |
| Source | `REVISIUM_SOURCE_URL` | `REVISIUM_SOURCE_TOKEN` | `REVISIUM_SOURCE_API_KEY` | `REVISIUM_SOURCE_USERNAME` | `REVISIUM_SOURCE_PASSWORD` |
| Target | `REVISIUM_TARGET_URL` | `REVISIUM_TARGET_TOKEN` | `REVISIUM_TARGET_API_KEY` | `REVISIUM_TARGET_USERNAME` | `REVISIUM_TARGET_PASSWORD` |

If mutually exclusive auth methods are supplied, keep the current conflict handling and fail with a clear message instead of silently choosing a different credential.

In CI or when `--no-input` is set, missing required data must fail fast with remediation:

```text
No credentials found for context "cloud-admin" credential "admin".
Run: revisium auth login --instance cloud --credential admin --api-key
Or set: REVISIUM_API_KEY=...
```

## Proposed Commands

### Instance Commands

```bash
revisium instance add <name> --url <revisium-server-url> [--auth none|stored]
revisium instance list
revisium instance show <name>
revisium instance remove <name>
```

Rules:

- Instance commands read and write the workspace config at `.revisium/revisium-cli.config.json`.
- Prefer `revisium://host[:port]` for user input.
- Accept full `revisium://host/org/project/branch[:revision]` URLs and store only the server location on the instance.
- Store the normalized HTTP(S) base URL internally if it simplifies API calls.
- `--auth none` is explicit and should be used by local standalone examples that run with auth disabled.
- `--auth stored` is the default for authenticated instances.
- Names should be simple identifiers: `local`, `dev`, `staging`, `cloud`.
- `remove` should not delete credentials unless `--with-credentials` is passed.

### Auth Commands

```bash
revisium auth login --url <revisium-url> [--credential <name>] --api-key [--force]
revisium auth login --instance <name> [--credential <name>] --api-key [--force]
revisium auth login --instance <name> [--credential <name>] --api-key-stdin [--force]
revisium auth status [--instance <name>] [--credential <name>]
revisium auth logout [--instance <name>] [--credential <name>]
```

Rules:

- `--api-key` prompts with hidden input.
- `--url` is preferred for first-time setup because it can derive the instance without a pre-existing workspace alias.
- `--instance` resolves the instance from the workspace config.
- `--credential` defaults to `default` and selects the credential-store account suffix.
- `--api-key-stdin` reads one line from stdin for scripted setup.
- `auth login` should reject instances configured with `authMode: "none"` unless `--force` is passed to intentionally save credentials for future auth-enabled runs.
- `auth status` should call the API and identify the current principal where possible. Until Auth Principal Introspection is available, it should use `me()` for user-token credentials and report service API key identity as limited rather than pretending to fully identify it.
- `auth logout` deletes local saved credentials. If OAuth is later added, it should also revoke refresh tokens when possible.

Optional future OAuth commands:

```bash
revisium auth login --instance cloud --browser
revisium auth login --instance cloud --device
```

OAuth is lower-priority future scope in this plan. When implemented, it should use authorization code + PKCE with a loopback redirect for normal desktops, or OAuth device authorization grant for SSH/headless terminals.

### Context Commands

```bash
revisium context create <name> --url <revisium-url> [--credential <credential>]

revisium context create <name> \
  --instance <instance> \
  --credential <credential> \
  --org <organization> \
  --project <project> \
  --branch <branch> \
  --revision <draft|head|revision-id>

revisium context list
revisium context show [name]
revisium context use <name>
revisium context remove <name>
```

Rules:

- Context commands read and write the workspace config at `.revisium/revisium-cli.config.json`.
- Default branch remains `master`.
- Default revision remains `draft`.
- `--url revisium://host/org/project/branch[:revision]` is the preferred creation path.
- `--credential` is optional and defaults to `default` when the instance uses `authMode: "stored"`.
- `context use` updates `currentContext` in the workspace config.
- Mutating commands must reject `head` or explicit read-only revisions unless the operation is read-only.

### Project Commands

```bash
revisium project ensure [--url <url> | --context <name>]
```

Behavior:

- Ensure organization/project/branch path exists.
- If project exists, exit successfully and report `skipped`.
- If project is missing, create it and report `created`.
- If the organization/auth is invalid, fail with the original auth/permission error.

### Endpoint Commands

```bash
revisium endpoint ensure --type REST_API
revisium endpoint ensure --type GRAPHQL
revisium endpoint list
```

Behavior:

- Ensure an endpoint of the requested type exists on the selected revision.
- Re-running should not create duplicates.
- Print endpoint id, type, revision target, and useful URL hints.
- `endpoint list --json` should return machine-readable endpoint metadata.

### Example Bootstrap Command

```bash
revisium example bootstrap \
  --config ./bootstrap.config.json \
  --context dictionary-local \
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

- Ensure project exists.
- Create tables that are missing.
- Create rows that are missing.
- Create endpoints that are missing.
- Treat existing resources with matching content as `skipped`.
- Treat existing resources with different content as conflicts and stop without modifying them. This includes table schema mismatches, row data mismatches, and endpoint type/config mismatches if endpoint config grows beyond type-only creation.
- Commit only when `--commit` is passed.
- Be idempotent: after a successful first run, a second run with the same config should report only `skipped` resources.
- Print created/skipped/conflict counts for tables, rows, endpoints, and commit.
- Support `--dry-run`, `--json`, and `--no-input`.
- Support repeated `--endpoint TYPE` flags. If at least one `--endpoint` flag is provided, those flags replace the bootstrap config's `endpoints` array for that run instead of merging with it.
- `--dry-run` should report the same created/skipped/conflict plan without writing or committing.
- Updates to existing resources are out of scope for the first implementation. Add a future explicit flag such as `--update-existing` only after the conflict behavior is stable.

Example endpoint override:

```bash
revisium example bootstrap \
  --config ./bootstrap.config.json \
  --endpoint REST_API \
  --endpoint GRAPHQL
```

This runs with effective endpoints `["REST_API", "GRAPHQL"]` regardless of the `endpoints` array in the bootstrap config.

## Shared Client Work First

Add reusable helpers to `@revisium/client` before CLI-only logic:

```ts
await client.ensureProject({ org, project, branch });
await revision.ensureTable(tableId, schema);
await revision.ensureRow(tableId, rowId, data);
await revision.ensureEndpoint({ type: 'REST_API' });
```

The helpers should return structured results:

```ts
type EnsureResult<T> =
  | { status: 'created'; value: T }
  | { status: 'skipped'; value: T }
  | { status: 'conflict'; value?: T; reason: string };
```

This keeps idempotency semantics available to examples, scripts, and the CLI.

## API Coverage In `@revisium/client`

The generated SDK in `@revisium/client` should remain the main coverage layer for the current Core REST/System API. It already exposes auth login, users, projects, branches, revisions, tables, rows, migrations, endpoints, files, and system configuration operations generated from OpenAPI.

The CLI should not duplicate those HTTP calls. Instead:

- Use the generated SDK when a low-level endpoint already exists.
- Use the high-level scope API when it already models the operation clearly.
- Add missing high-level helpers to `@revisium/client` when behavior is reusable outside the CLI.
- Add new Core API endpoints only when the server cannot answer an operational question the CLI needs.

Expected near-term `@revisium/client` work:

- Structured error type that preserves HTTP status and response details.
- Idempotent ensure helpers for projects, tables, rows, and endpoints.
- Endpoint URL helper methods once the server exposes enough public URL data.
- Auth credential helpers for API key, OAuth access token, refresh, and revoke flows.

Expected Core API gaps:

- Auth principal introspection for `auth status`, especially service API keys.
- API key lifecycle APIs if the CLI should create, list, rotate, or revoke keys.
- Public endpoint URL metadata when endpoint service URLs differ from the Core base URL.
- OAuth device authorization grant if the CLI should support SSH/headless browserless login.

## CLI Output Rules

- Human output goes to stderr when it is progress, warnings, prompts, or diagnostics.
- Successful command payloads go to stdout.
- `--json` should write only valid JSON to stdout.
- `--quiet` should suppress non-essential human output.
- `--no-input` should disable all prompts.
- Errors should include a short fix suggestion when the problem is actionable.

Example JSON output:

```json
{
  "context": "dictionary-local",
  "tables": { "created": 2, "skipped": 3, "conflicts": [] },
  "rows": { "created": 12, "skipped": 0, "conflicts": [] },
  "endpoints": { "created": ["REST_API"], "skipped": ["GRAPHQL"], "conflicts": [] },
  "commit": { "status": "created", "revisionId": "rev_123" }
}
```

## API Gaps To Consider

### Auth Principal Introspection

`auth status` needs a reliable way to describe the current credential. `me()` works for user JWTs and personal keys, but service API keys may not map cleanly to a user. Add or expose a principal endpoint that can return:

```json
{
  "authMethod": "apikey",
  "principalType": "service_account",
  "displayName": "docs-bootstrap",
  "scopes": ["project:write"],
  "expiresAt": null
}
```

### Endpoint URL Hints

Endpoint commands need consistent URL generation for:

- GraphQL: `/endpoint/graphql/<org>/<project>/<branch>/<head|draft|revisionId>`
- REST OpenAPI: `/endpoint/openapi/<org>/<project>/<branch>/<head|draft|revisionId>/openapi.json`
- REST API: `/endpoint/rest/<org>/<project>/<branch>/<head|draft|revisionId>`

If endpoint service public URL differs from core base URL, the server should expose enough configuration for accurate hints.

## Implementation Phases

### Phase 1: Foundation

- [ ] Add structured API error type in `@revisium/client`.
- [ ] Add client ensure helpers.
- [ ] Add unit/integration tests for idempotency.
- [x] Add workspace CLI config service for non-secret instances and contexts at `.revisium/revisium-cli.config.json`.
- [ ] Add credential-store abstraction with named credentials and an in-memory fake for tests.
- [x] Add explicit no-auth connection mode for local standalone workflows.

### Phase 2: Auth And Context Commands

- [x] Implement `instance` commands.
- [ ] Implement `auth login/status/logout` for API keys.
- [x] Implement `context` commands.
- [ ] Add common `--context`, `--json`, `--quiet`, and `--no-input` behavior. `--context` is implemented for single-target commands; the output/non-interactive flags still need consistent handling.

### Phase 3: Ensure Commands

- [ ] Implement `project ensure`.
- [ ] Implement `endpoint ensure` and `endpoint list`.
- [ ] Add endpoint URL hints.
- [ ] Add docs and command table updates.

### Phase 4: Example Bootstrap

- [ ] Implement `example bootstrap`.
- [ ] Validate bootstrap config shape.
- [ ] Add idempotency tests and invalid-config tests.
- [ ] Update `revisium-examples` scripts only after the CLI feature is released.

### Phase 5 (Optional Future): Human OAuth Login

- [ ] Add browser login with PKCE loopback.
- [ ] Add device login for SSH/headless terminals if the server supports OAuth device authorization grant.
- [ ] Store refresh material in the credential store.
- [ ] Add token refresh/revoke support.

## Validation Checklist

- `npm run lint:ci`
- `npm test`
- `npm run build`
- E2E smoke with standalone default no-auth config and committed `.revisium/revisium-cli.config.json`.
- E2E smoke with standalone auth enabled.
- Non-interactive smoke with `--no-input`.
- JSON-output snapshot tests for `--json`.
- Re-run bootstrap twice and confirm second run reports only skipped resources.
- Bootstrap conflict tests for table schema mismatch, row data mismatch, and endpoint mismatch.

## References

- GitHub CLI auth and environment behavior: https://cli.github.com/manual/gh_auth_login
- Docker credential store and stdin secret pattern: https://docs.docker.com/reference/cli/docker/login/
- AWS named profiles: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html
- Google Cloud named configurations: https://cloud.google.com/sdk/gcloud/reference/topic/configurations
- kubectl contexts: https://kubernetes.io/docs/reference/kubectl/generated/kubectl_config/kubectl_config_set-context/
- OAuth 2.0 for Native Apps: https://www.rfc-editor.org/rfc/rfc8252
- OAuth 2.0 Device Authorization Grant: https://www.rfc-editor.org/rfc/rfc8628
