# revisium-cli — Agent Guide

Context for AI coding assistants (Claude, Cursor, Copilot Workspace, Aider, etc.) working on this repository. Keep edits minimal and scoped; verify with the commands listed below.

## What this is

`revisium-cli` is a NestJS / `nest-commander` CLI for managing Revisium instances: schema export/import, migrations, row sync, project/endpoint bootstrap, workspace configuration, and saved API-key auth. It ships as the `revisium` npm binary.

Primary command groups:

- `migrate save/apply` — schema migrations
- `schema save/create-migrations` — schema export + offline migration generation
- `rows save/upload` — data export/import
- `sync schema/data/all` — direct project-to-project sync
- `instance add/list/show/remove` — workspace instance config
- `context create/list/show/use/remove` — workspace contexts
- `auth login/status/logout` — saved API-key credentials (OS keyring)
- `project ensure` — idempotent project + branch creation
- `endpoint ensure/list` — generated REST/GraphQL endpoints
- `example bootstrap` — end-to-end project seeding from a config file

## Commands

| Goal              | Command                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Type-check        | `npm run tsc`                                                                                    |
| Lint (CI mode)    | `npm run lint:ci`                                                                                |
| Lint + autofix    | `npm run lint`                                                                                   |
| Unit tests        | `npm test -- --runInBand`                                                                        |
| Unit + coverage   | `npm run test:cov`                                                                               |
| Build the binary  | `npm run build` (outputs `dist/src/main.js`)                                                     |
| E2E (default)     | `npm run test:e2e` (expects standalone running on `localhost:8082`; bring it up with `test:e2e:up`/`test:e2e:down`) |
| E2E matrix        | `npm run test:e2e:matrix` — opt-in; see `e2e/matrix/README.md`                                   |
| E2E matrix (alpha) | `npm run test:e2e:matrix:alpha` — runs the matrix against a published alpha CLI (default `revisium@2.5.0-alpha.0`); override with `REVISIUM_CLI_PACKAGE=revisium@<version>` |

Local CLI invocation: `node dist/src/main.js <command>` (the `revisium` shim points at the same file).

## Code layout

```
src/
  app.module.ts                          # NestJS module wiring all commands + services
  main.ts                                # CommandFactory entry point
  commands/
    auth/                                # auth login/status/logout, AuthCommandTarget helpers
    instance/                            # instance add/list/show/remove
    context/                             # context create/list/show/use/remove
    project/                             # project ensure
    endpoint/                            # endpoint ensure/list
    example/                             # example bootstrap
    migration/                           # migrate save/apply
    schema/                              # schema save / create-migrations
    rows/                                # rows save / upload
    sync/                                # sync schema / data / all
    base.command.ts                      # shared --url / --context options
    base-sync.command.ts                 # shared sync flags
  services/
    bootstrap/                           # BootstrapService: ensureProject / ensureTable / ensureRow / ensureEndpoint / bootstrapExample
    connection/                          # RevisiumApiClient + ConnectionService
    credentials/                         # OS keyring-backed API key store + credential-target resolver
    sync/                                # sync orchestration helpers
    url/                                 # URL parsing / building, AuthPromptService
    workspace/                           # .revisium/revisium-cli.config.json reader/writer
    common/                              # logging, JSON validation, interactive prompts
  utils/                                 # parse-boolean, env-config, error formatter, stats
e2e/
  tests/                                 # default e2e suite (legacy, hits docker-compose standalone)
  matrix/                                # opt-in matrix; each suite owns a fresh @revisium/standalone
  utils/                                 # cli-runner, standalone-runner, standalone-api, fixtures, workspace helpers
docs/                                    # public docs surfaced from README.md
```

## Conventions

- **Strict ESLint config** with `--max-warnings 0` and Prettier integration. Run `npm run lint` after edits — auto-fix handles most issues.
- **Tests live in `__tests__/` next to the code** and end in `.spec.ts`. Existing patterns: instantiate the command/service directly with hand-rolled fakes (no Nest test module overhead). See `src/commands/auth/__tests__/auth-status.command.spec.ts` for a representative example.
- **Coverage threshold:** SonarCloud requires `new_coverage ≥ 80%` on each PR. Add tests for new branches in the same PR.
- **Validation errors** thrown for config-shape problems use `TypeError` (Sonar S7786). Operational errors stay as plain `Error`.
- **No `--no-input` plumbing yet.** A common-flags PR is planned; until then, don't expose `--no-input` as a per-command option (it would be dead code).
- **OS keyring service name** can be overridden via `REVISIUM_CREDENTIAL_STORE_SERVICE` for tests so saved keys don't bleed into the developer's keyring.

## Trust-but-verify checklist

After making changes, run **all** of:

```sh
npm run tsc
npm run lint:ci
npm test -- --runInBand
npm run build
```

If touching e2e helpers or matrix specs, ensure the additions still type-check and lint clean (the matrix is intentionally not run on default CI).

## Running the e2e matrix against an alpha CLI

The matrix in `e2e/matrix/` boots a fresh `@revisium/standalone` per suite and exercises a CLI binary against it. By default that's the locally-built `dist/src/main.js`; for release validation you can swap in a published version without rebuilding.

`runCli()` honours two env vars (in order of precedence):

| Env var                | Effect                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `REVISIUM_CLI_PACKAGE` | invoke via `npx -y --package=<spec> revisium ...` (e.g. `revisium@2.5.0-alpha.0`)               |
| `REVISIUM_CLI_BIN`     | invoke via `node <abs-path>` — useful for a side-checkout build                                 |

Stable standalone is pinned via the `@revisium/standalone` `devDependency` in `package.json`; `startStandalone()` resolves it through `npx --yes`, so `npm ci` locks the version.

### Quick recipes

```sh
# Run the entire matrix against the published 2.5.0-alpha.0 + pinned standalone
npm run test:e2e:matrix:alpha

# Pin to a different alpha tag for the same script
REVISIUM_CLI_PACKAGE=revisium@2.5.0-alpha.1 npm run test:e2e:matrix:alpha

# Drive the matrix by hand against any spec
REVISIUM_CLI_PACKAGE=revisium@2.5.0-alpha.0 npm run test:e2e:matrix

# One suite only (useful for triage)
REVISIUM_CLI_PACKAGE=revisium@2.5.0-alpha.0 npm run test:e2e:matrix -- --testPathPattern=M06

# Stream standalone logs to stderr (debug startup or seeding issues)
E2E_STANDALONE_LOGS=1 REVISIUM_CLI_PACKAGE=revisium@2.5.0-alpha.0 npm run test:e2e:matrix
```

### Prompt template for triaging an alpha matrix run

When a suite fails against `revisium@<alpha>`, paste this into your assistant:

```
Run `REVISIUM_CLI_PACKAGE=revisium@<alpha-version> npm run test:e2e:matrix -- --testPathPattern=<M0X>` from the revisium-cli repo root.

Goal: figure out whether the failure is
  (a) a regression in the alpha CLI vs the previous stable, or
  (b) a stale assumption in the matrix spec.

When investigating:
- Read the failing assertion and the surrounding `it(...)` description in `e2e/matrix/<M0X>-*.e2e-spec.ts`
- Compare alpha behaviour against the `master` CLI by also running the same suite without `REVISIUM_CLI_PACKAGE`
- Check the standalone version is the pinned one (`@revisium/standalone` in package.json devDependencies)
- Inspect `process.stderr` from `runCli` (set `E2E_STANDALONE_LOGS=1` for the sandbox process)
- Do NOT modify matrix specs to "make them pass" against the alpha unless the spec was wrong; otherwise file a regression issue against revisium-cli with the failing case.

Report: failing-suite name, alpha version, root cause, and whether the fix belongs in the CLI or the spec.
```

## When to update this file

Whenever a convention changes — e.g., a new command surface, a non-obvious testing pattern, a new lint rule — update both the relevant section and the commands table.

> Tools that look for `CLAUDE.md` will follow the symlink in repo root to this file. Treat `AGENTS.md` as the single source of truth.
