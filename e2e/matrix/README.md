# Revisium CLI E2E Matrix

Status: Authoring — tests will be exercised against the alpha `revisium-cli` release paired with stable `@revisium/standalone`.

## Goal

Drive every `revisium-cli` command and resolution path against a real `@revisium/standalone` instance, so we catch regressions in:

- argument parsing and subcommand dispatch
- target resolution (`--url`, `--context`, env, workspace, URL auth)
- authentication (token, API key, password, saved API key, no-auth)
- idempotency (project / endpoint / table / row / endpoint ensure)
- output formats (`--json`, human, `--dry-run`)
- conflict and error paths (schema mismatch, row mismatch, invalid configs, non-draft target)
- cross-instance flows (`sync schema/data/all`)

Each suite spins up a **fresh standalone** in a temp data directory, prepares its own auth + fixtures via the standalone REST/GraphQL API, runs the CLI binary, and tears down.

## Runtime contract

- Each `.e2e-spec.ts` file under `e2e/matrix/` owns its standalone instance(s).
- A standalone starts on a random free port, with `--data <tempDir>`, optional `--auth`, optional `ADMIN_PASSWORD`.
- After the suite, `afterAll` stops the process and removes the temp dir.
- The CLI binary is the one in `dist/src/main.js` (`E2E_INSTRUMENTED=1` swaps to `dist-instrumented/...` for coverage).
- `runCli(args, { cwd, env })` from `e2e/utils/cli-runner.ts` is the single way to invoke the CLI; tests must clear `REVISIUM_*` env vars they don't need (see `CLEAR_REVISIUM_ENV`).
- `cwd` is always a fresh per-test workspace tempdir, so `.revisium/revisium-cli.config.json` doesn't bleed across tests.
- Saved API-key credentials use a per-test `REVISIUM_CREDENTIAL_STORE_SERVICE` namespace so OS keyring entries don't bleed.

## Matrix axes

### Auth modes

| ID                    | Standalone flag      | Prep steps                                                                                                         |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **AUTH-NONE**         | _no `--auth`_        | start standalone; CLI talks to it without credentials                                                              |
| **AUTH-TOKEN**        | `--auth`             | log in as admin (`ADMIN_PASSWORD`); use returned JWT as `--token`/`REVISIUM_TOKEN`                                 |
| **AUTH-APIKEY**       | `--auth`             | login → mint org-scoped API key via `POST /api/organizations/<org>/api-keys`; use as `--api-key`/`REVISIUM_API_KEY` |
| **AUTH-PASSWORD**     | `--auth`             | use `REVISIUM_USERNAME` / `REVISIUM_PASSWORD` env (or `user:pass@host` URL form)                                   |
| **AUTH-STORED**       | `--auth`             | `revisium auth login --api-key-stdin` saves to OS keyring under per-test service name; subsequent commands resolve |
| **AUTH-URL-TOKEN**    | `--auth`             | embed `?token=...` in URL                                                                                          |
| **AUTH-URL-APIKEY**   | `--auth`             | embed `?apikey=...` in URL                                                                                         |
| **AUTH-URL-PASSWORD** | `--auth`             | embed `user:pass@host` in URL                                                                                      |

### Target resolution

| ID                    | Carrier                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| **TARGET-URL**        | `--url revisium://host/org/proj/branch[:rev]`                                 |
| **TARGET-CONTEXT**    | `--context <name>` against an existing workspace `revisium-cli.config.json`   |
| **TARGET-CURRENT**    | `currentContext` resolved from the workspace config                           |
| **TARGET-ENV-URL**    | `REVISIUM_URL` env var                                                        |
| **TARGET-ENV-PARTS**  | `REVISIUM_HOST` / `REVISIUM_ORG` / `REVISIUM_PROJECT` / `REVISIUM_BRANCH`     |
| **TARGET-INSTANCE**   | command takes `--instance` (auth commands) and resolves via workspace config  |
| **TARGET-MIXED**      | precedence: explicit flag > URL auth > env > workspace > interactive (denied) |

### Output / behaviour flags

`--json`, `--dry-run`, `--commit`, `--quiet` (where supported), repeated `--endpoint`, `--no-input` (when wired).

---

## Suites

Each row below is implemented as one `*.e2e-spec.ts` file in `e2e/matrix/`. The "Prep" column lists the deterministic steps each `beforeAll` / `beforeEach` performs against the standalone REST API.

### M01-auth-commands

**Files:** `M01-auth-commands.e2e-spec.ts`
**Standalone:** one instance, `--auth`
**Prep:**

1. Start standalone with `ADMIN_PASSWORD=test-admin` and `--auth`.
2. Wait for `/health/readiness`.
3. `POST /api/auth/login` with admin credentials → store JWT.
4. Mint two API keys: `default` and `automation` via `POST /api/organizations/admin/api-keys` (one expires soon, one long-lived).
5. Pick a per-suite `REVISIUM_CREDENTIAL_STORE_SERVICE` so saved keys don't collide with the user's keyring.

**Cases (AUTH-STORED axis):**

- `auth login --url <baseUrl> --api-key` (interactive prompt mocked via `--api-key-stdin`).
- `auth login --instance <name>` after `instance add`.
- `auth login --credential <name>` saves under that name.
- `auth login --force` overrides existing entry.
- `auth login` against `authMode: "none"` rejects without `--force`.
- `auth status` for stored credential reports OK; against missing credential prints login hint.
- `auth status` for `authMode: "none"` instance prints "bypassed" message.
- `auth logout --instance` removes the saved credential.
- `auth logout --credential <name>` removes a specific credential.
- Logging in twice with different `--credential` values lets `auth status --credential` distinguish them.

### M02-instance-commands

**Files:** `M02-instance-commands.e2e-spec.ts`
**Standalone:** one instance, `--auth` (commands are workspace-only, but a real baseUrl is needed for URL normalization).
**Prep:** start standalone; obtain its baseUrl.
**Cases:**

- `instance add <name> --url revisium://host:port` writes workspace config.
- `instance add` accepts full `revisium://host/org/project/branch` and stores only the server location.
- `instance add --auth none` and `--auth stored` (default) round-trip through `instance show`.
- `instance list` after multiple adds returns sorted list.
- `instance remove <name>` removes; `--with-credentials` also clears the saved credential (verified via `auth status`).
- Re-adding an existing instance without `--force` errors.

### M03-context-commands

**Files:** `M03-context-commands.e2e-spec.ts`
**Standalone:** one instance, `--auth`.
**Prep:**

1. Start standalone, log in, mint API key.
2. Seed two projects `dictionary` and `taxonomy` via REST.
3. Create instance `local` in workspace.
**Cases:**

- `context create dictionary-local --instance local --org admin --project dictionary` writes config.
- `context create from-url --url revisium://host/admin/dictionary/master:draft` parses parts.
- Mutating commands reject `head` / non-draft revision.
- `context list` / `context show` / `context use dictionary-local` round-trip.
- `context use taxonomy-local` updates `currentContext`.
- `context remove dictionary-local` removes; `currentContext` cleared when it was the active one.

### M04-project-ensure

**Files:** `M04-project-ensure.e2e-spec.ts`
**Standalone:** `--auth`, `AUTH-APIKEY`.
**Prep:** start standalone, log in, mint API key, no projects yet.
**Cases (×each TARGET axis):**

- Fresh project → `project ensure --url <revisium-url>` creates project + master branch (`projectStatus: created`, `branchStatus: created`).
- Re-run → `projectStatus: skipped` / `branchStatus: skipped`.
- `--dry-run` → reports `created` but standalone GraphQL still 404s on the project.
- Non-default branch (`/master/feature`) → re-run after ensure shows branch was created from rootBranch head.
- `--json` payload matches `ProjectEnsureResult` shape exactly.
- Auth precedence: `--token <X>` overrides `REVISIUM_API_KEY`; URL `?token=` overrides env.
- Stored credential path: `auth login` then `project ensure --instance local` works without `--token`/`--api-key`.

### M05-endpoint-commands

**Files:** `M05-endpoint-commands.e2e-spec.ts`
**Standalone:** `--auth`, `AUTH-APIKEY`.
**Prep:**

1. Start standalone, log in, mint API key.
2. Seed project `dictionary` with master branch.
3. Bootstrap a single table `Tag` so the draft revision is non-empty.
**Cases:**

- `endpoint ensure --type REST_API` first run → `Created`; second run → `Found`; `--dry-run` does not create.
- `endpoint ensure --type GRAPHQL` independent of REST_API.
- `endpoint ensure --type INVALID` rejects with `parseEndpointType` error.
- `endpoint list` returns both endpoints once created; `--json` returns `{ endpoints: [...] }`.
- `endpoint list` against a freshly-bootstrapped project with no endpoints returns "No generated endpoints found" / `{ endpoints: [] }`.

### M06-example-bootstrap

**Files:** `M06-example-bootstrap.e2e-spec.ts`
**Standalone:** `--auth`, `AUTH-APIKEY`.
**Prep:**

1. Start standalone, log in, mint API key.
2. For each test, write a fresh `bootstrap.config.json` into a workspace tempdir using `matrix-fixtures.ts` builders (`tagsFixture()`, `faqFixture()`, etc.).
**Cases:**

- Empty target → all created; second run → all skipped (idempotent).
- `--commit` creates a revision; revision id appears in `summary.commit.revisionId`.
- `--dry-run` reports created counts without writing — verified by calling REST API to confirm the project still has no `Tag` table.
- `--dry-run` against a project that has the rootBranch already populated diffs against root head and reports `skipped` for inherited resources (regression test for the issue fixed in #73 review round).
- `--endpoint REST_API --endpoint GRAPHQL` overrides `endpoints` from config.
- Schema conflict: pre-seed table `Tag` with a different schema; bootstrap rejects with `Bootstrap table conflict: Tag: existing table schema differs ...` and writes nothing.
- Row conflict: pre-seed row with different data; bootstrap rejects with `Bootstrap row conflict: ...`.
- `projectName` mismatch in config rejects before any creation.
- `branchName` mismatch in config rejects before any creation.
- Non-draft revision (`master:head`) rejects with `requires a draft revision` and creates nothing (regression for the issue fixed in #73 review round).
- Invalid config: empty file, non-object root, wrong types per field, missing fields, non-string endpoints → each rejects with the specific validation message.
- `--json` output schema matches `ExampleBootstrapSummary`.

### M07-migrate

**Files:** `M07-migrate.e2e-spec.ts`
**Standalone:** `--auth`, `AUTH-APIKEY`.
**Prep:**

1. Start standalone, log in, mint API key, seed source project with `Tag` table + 3 rows.
2. Pre-build expected migration JSON via `matrix-fixtures.tagMigration()`.
**Cases:**

- `migrate save --file ./out.json --url <source>` exports a migration JSON; deep-equals the fixture.
- `migrate apply --file ./out.json --commit --url <empty target>` creates the table; revision committed.
- Re-applying the same migration is a no-op (idempotent).
- `migrate apply --create-project` against missing project creates it before applying.
- `migrate apply` against `master:head` without `--commit` rejects (writes need draft).

### M08-schema

**Files:** `M08-schema.e2e-spec.ts`
**Standalone:** `--auth`, `AUTH-APIKEY`.
**Prep:** seed project with three tables.
**Cases:**

- `schema save --folder ./schemas` writes one JSON per table; schemas match REST output.
- `schema create-migrations --folder ./schemas --output ./out.json` is offline (no network) and produces a deep-equal migration.
- Round-trip: `schema save` → `schema create-migrations` → `migrate apply` results in identical schemas in target.

### M09-rows

**Files:** `M09-rows.e2e-spec.ts`
**Standalone:** `--auth`, `AUTH-APIKEY`.
**Prep:** seed project with table `Quest` + 50 rows (uses `matrix-fixtures.questsFixture(50)`).
**Cases:**

- `rows save --folder ./data` writes one file per table containing all rows.
- `rows upload --folder ./data --commit` against an empty target imports them; row count matches via REST.
- Batch size flag (`--batch <n>`) honoured; verified by intercepting CLI logs.
- Foreign-key dependency ordering: tables with refs imported in the right order (smoke test for `TableDependencyService`).

### M10-sync

**Files:** `M10-sync.e2e-spec.ts`
**Standalone:** **two** instances (source + target), both `--auth`.
**Prep:**

1. Start standalone-source on port A, target on port B.
2. Mint API keys on each, expose as `REVISIUM_SOURCE_API_KEY` / `REVISIUM_TARGET_API_KEY`.
3. Seed source project with schema + rows; create empty target project.
**Cases:**

- `sync schema --source ... --target ...` copies tables.
- `sync data --source ... --target ...` copies rows.
- `sync all --commit` performs both; final REST diff is empty.
- `sync all` honours `REVISIUM_SOURCE_*` / `REVISIUM_TARGET_*` env vars (no `?apikey=` in the URL).
- Source `:head` fixed-revision mode produces consistent target.
- Mutually-exclusive auth (e.g. both `?token=` and `REVISIUM_TARGET_TOKEN`) is rejected with a clear conflict message.

### M11-target-resolution

**Files:** `M11-target-resolution.e2e-spec.ts`
**Standalone:** one instance, `--auth`.
**Prep:** seed project, mint key, write workspace config with two contexts.
**Cases (single, well-known command — `project ensure`):**

- `--url` wins over `--context` and over `REVISIUM_URL`.
- `--context` wins over `REVISIUM_URL` and over `currentContext`.
- `REVISIUM_URL` wins over workspace `currentContext`.
- `currentContext` resolves the target when nothing else is set.
- No target + `--no-input`-equivalent (CI tty heuristics) → fails fast.
- URL credential precedence: `--token` overrides `?token=` overrides `REVISIUM_TOKEN`.

### M12-error-paths

**Files:** `M12-error-paths.e2e-spec.ts`
**Standalone:** one instance, `--auth`.
**Cases:**

- Unauthenticated request to `--auth` standalone returns "auth required" with login hint.
- Wrong API key returns 401 surfaced with "invalid credential" hint.
- Workspace config with broken JSON → CLI prints clear path + parse error.
- `instance remove` of unknown name fails fast.
- `context use` of unknown name fails fast.
- `migrate apply --file <missing>` fails with file-read error including the path.
- `example bootstrap --config <missing>` fails before contacting the server.

### M13-no-auth-mode

**Files:** `M13-no-auth-mode.e2e-spec.ts`
**Standalone:** **without** `--auth`.
**Prep:** start standalone (no auth), seed project via REST.
**Cases:**

- `instance add local --url <baseUrl> --auth none` then `project ensure --instance local` works without any credential.
- `auth login --instance local` rejected unless `--force`.
- `example bootstrap` works unauthenticated.

### M14-multi-instance-workspace

**Files:** `M14-multi-instance-workspace.e2e-spec.ts`
**Standalone:** **two** instances (`primary`, `secondary`), both `--auth`.
**Prep:**

1. Start both standalone instances.
2. Mint API key on each.
3. Workspace config has both as instances + one context per.
**Cases:**

- `auth login --instance primary` and `--instance secondary` save independent credentials.
- `context use primary-default` then `project ensure` targets primary; `context use secondary-default` flips it.
- `auth status --instance secondary` does not see primary's credential.

---

## Helper layout

```text
e2e/utils/
  standalone-runner.ts   — spawns @revisium/standalone, waits for /health/readiness, returns { baseUrl, port, api, url(), stop() }
  standalone-api.ts      — REST/GraphQL helpers: login, mintApiKey, createProject, projectExists, seedTable, seedRow, listTables, listEndpoints
  matrix-fixtures.ts     — pure fixture builders (tagSchema, faqSchema, questsRows, bootstrapConfig)
  matrix-workspace.ts    — tempdir + workspace-config helpers (writeConfig, withCredentialStoreNamespace)
e2e/matrix/
  README.md              — this file
  M01-auth-commands.e2e-spec.ts
  M02-instance-commands.e2e-spec.ts
  ...
  M14-multi-instance-workspace.e2e-spec.ts
```

## Per-test prep template

Every `*.e2e-spec.ts` follows this skeleton:

```ts
describe('Mxx — <area>', () => {
  let standalone: StandaloneInstance;
  let apiKey: string;
  const credentialStoreService = `revisium-cli-e2e-${randomId()}`;

  beforeAll(async () => {
    standalone = await startStandalone({ auth: true, adminPassword: 'test-admin' });
    const adminToken = await standalone.api.login();
    apiKey = await standalone.api.mintApiKey('admin', { name: 'matrix' });
    await standalone.api.seedFixture(/* per-suite seed */);
  }, 120_000);

  afterAll(async () => {
    await standalone.stop();
  });

  it('<case>', async () => {
    const workspace = createWorkspace();              // tempdir
    writeWorkspaceConfig(workspace, { /* ... */ });    // optional
    const env = {
      ...CLEAR_REVISIUM_ENV,
      REVISIUM_API_KEY: apiKey,
      REVISIUM_CREDENTIAL_STORE_SERVICE: credentialStoreService,
    };

    const result = await runCli(['project', 'ensure', '--url', standalone.url(/* ... */)], { cwd: workspace, env });
    expect(result.exitCode).toBe(0);
    /* assertions on stdout/stderr + REST verification */
  });
});
```

## Running

The matrix is opt-in. Default `npm run test:e2e` keeps existing CI fast.

- `npm run test:e2e:matrix` — run against the locally-built CLI (`dist/src/main.js`), one fresh standalone per suite file.
- `npm run test:e2e:matrix -- --testPathPattern=M06` — run a single suite.
- `npm run test:e2e:matrix:cov` — instrumented build for coverage reporting; same suite set.
- `npm run test:e2e:matrix:alpha` — run against a published alpha CLI release (default: `revisium@2.5.0-alpha.0`). See "Choosing the CLI under test" below.

## Choosing the CLI under test

`runCli()` honours two env vars to override which binary is exercised:

| Env var                  | Meaning                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `REVISIUM_CLI_PACKAGE`   | npm spec to invoke via `npx -y --package=<spec> revisium ...` — accepts a dist-tag (`revisium@alpha`) or exact version (`revisium@2.5.0-alpha.0`) |
| `REVISIUM_CLI_BIN`       | absolute path to a `main.js` to invoke via `node <bin>` (e.g. `/path/to/checkout/dist/src/main.js`)        |
| _(neither set)_          | fall back to the locally-built `dist/src/main.js`; instrumented coverage uses `dist-instrumented/...`      |

`REVISIUM_CLI_PACKAGE` wins over `REVISIUM_CLI_BIN`, which wins over the local dist.

## Pinning the standalone

`@revisium/standalone` is a `devDependency` pinned to a stable version in `package.json`. `startStandalone()` invokes it via `npx --yes @revisium/standalone`, so npm resolves it from the lockfile during `npm ci`. To pin to a specific release explicitly (e.g. for a published alpha matrix run), pass `version` to `startStandalone({ version: '2.8.1' })` or update the devDependency.

## Alpha-vs-stable matrix run

To exercise a published alpha CLI against the pinned stable standalone:

```sh
# 1. Make sure devDependencies (incl. stable @revisium/standalone) are installed.
npm ci

# 2. Run the matrix; the env var wins over the local dist. The `alpha`
#    dist-tag always resolves to the latest published alpha, so this stays
#    fresh without bumping any pin in this repo.
REVISIUM_CLI_PACKAGE=revisium@alpha npm run test:e2e:matrix

# Or use the pre-wired script (defaults to revisium@alpha):
npm run test:e2e:matrix:alpha
# Pin to an exact alpha version when investigating a specific build:
REVISIUM_CLI_PACKAGE=revisium@2.5.0-alpha.1 npm run test:e2e:matrix:alpha
```

`npx` caches the package after the first download, so subsequent jest workers reuse it.
