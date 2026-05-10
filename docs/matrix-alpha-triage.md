# Matrix run report — `revisium@2.5.0-alpha.0` × `@revisium/standalone@2.8.2-alpha.0`

Run command:

```sh
REVISIUM_CLI_PACKAGE=revisium@2.5.0-alpha.0 npm run test:e2e:matrix
```

Result: **55 / 79 passing** (≈70%). Three suites are fully green: M05 (endpoint commands), M07 (migrate), M13 (authMode none). M07 + M13 were already green; M05 became green after fixing the seeder.

The 24 remaining failures fall into categories below. Each is a candidate for a follow-up CLI issue — not a spec bug — unless noted.

---

## A. `auth status` doesn't differentiate "saved" vs "no saved credential" (CLI)

**Tests:** M01 × 3, M14 × 1 — `auth status` always prints the same envelope (`Instance / Base URL / Credential / Auth mode`) regardless of whether a credential is in the OS keyring.

| What the matrix expects                                                       | What 2.5.0-alpha.0 prints                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `Saved credential found` when keyring has a key for the resolved target      | always omitted                                         |
| `No saved credential found` when keyring is empty                            | always omitted                                         |
| login hint `revisium auth login --url ... --credential ... --api-key`         | not printed                                            |

**Action:** restore the Saved/No-Saved messages and the login hint in `auth status` (matches the helper text already shipped in PR #76 `auth-command.utils.ts`).

---

## B. `instance list` / `context list` reject `--json` (CLI)

**Tests:** M02 × 1, M03 × 1 — both list commands exit with code 1 when `--json` is supplied. The matrix expects machine-readable output (matches the bootstrap commands which already wire `--json`).

**Action:** add `--json` to `instance list` and `context list` (issue: common output flags follow-up).

---

## C. `instance remove --with-credentials` (CLI)

**Test:** M02 × 1 — `instance remove local --with-credentials` exits with code 1.

**Action:** implement the flag (per `docs/auth-contexts-and-bootstrap-plan.md` Phase 2 plan; was tagged "remove should not delete credentials unless `--with-credentials` is passed").

---

## D. `instance add` is permissive on duplicates (CLI)

**Test:** M02 × 1 — re-adding an existing instance returns exit 0; the spec expects a non-zero exit unless `--force` is passed.

**Action:** make duplicate `instance add` fail by default and accept `--force` to overwrite. Today nothing differentiates the two paths.

---

## E. Mutating commands accept `head`/non-draft contexts (CLI)

**Test:** M03 × 1 — `project ensure --context dictionary-head` (where the context's `revision: "head"`) returns exit 0 instead of failing with a "draft required" message.

The internal `BootstrapService.assertWritableRevision()` already does this on `--url` paths. The same guard isn't reached when the target is resolved via `--context`.

**Action:** apply `assertWritableRevision` to context-resolved targets too.

---

## F. `--json` output is mixed with status text on stdout (CLI)

**Tests:** M04 × 1, M11 × 2 — `project ensure --context X --json` writes `Using context X...` (a status line) to stdout before the JSON payload, so `JSON.parse` fails. The plan tracker explicitly says human/status output should go to stderr when `--json` is set.

**Action:** route the `Using context ...` line to stderr (or suppress it) when `--json` is set.

---

## G. `--token` (JWT) auth doesn't authenticate against the alpha standalone (CLI or standalone)

**Tests:** M04 × 1, M11 × 1, M10 × 4 (sync uses tokens for both ends).

The matrix tests were redesigned to use API keys minted via `createPersonalApiKey`, but `--token` is still expected to accept a JWT. With the JWT obtained from `/api/auth/login`, `project ensure --token <jwt>` exits 1.

Could be either:
- the alpha CLI sends `--token` in a header the alpha standalone no longer accepts, or
- the JWT lifetime is short enough that the test sequence outlives it.

**Action:** add a focused repro outside the matrix; if the JWT is rejected by standalone, document `--token` as service-token-only and update the matrix to use API keys instead.

---

## H. `sync schema` / `sync data` / `sync all` don't copy anything (CLI)

**Tests:** M10 × 3 — `sync schema --commit` exits 0 but the target project remains empty (`listTables` returns `[]`).

This was working in the local-build matrix earlier; failing on the alpha suggests a regression in the sync pipeline against the alpha standalone's GraphQL/REST schema.

**Action:** repro standalone-only and check the alpha CLI's source/target REST calls against the alpha standalone OpenAPI.

---

## I. `--dry-run` of `example bootstrap` against an existing populated rootBranch returns exit 1 (CLI)

**Test:** M06 × 1 — regression test for the issue fixed in #73 review round. Now exits 1 on the alpha; need stderr to know why.

**Action:** rerun with `E2E_STANDALONE_LOGS=1` and capture stderr to file the regression.

---

## J. `--no-input`-equivalent unauthenticated path triggers a prompt error (CLI)

**Test:** M12 × 1 — request without credentials prints `user force closed the prompt with 0 null` to stderr instead of an "auth required" message.

The matrix runs CLI in non-TTY mode, so the prompt should be skipped and a hard auth error returned. This is the dead-code observation we already captured in #76 (no `--no-input` plumbing yet); the fix lands with the common-flags PR.

**Action:** when stdin is non-TTY, skip auth prompts and return a helpful "no credential" error.

---

## K. JSON parse error on broken workspace config doesn't include the file path (CLI)

**Test:** M12 × 1 — error is just `Expected property name or '}' in JSON at position 2 (line 1 column 3)` — useful for humans but missing the path. The matrix asserts the path is included so users can find which config to fix.

**Action:** wrap the `JSON.parse` failure in `WorkspaceConfigService` and prefix it with the absolute path of the file.

---

## L. `rows upload --batch` returns exit 1 (CLI)

**Test:** M09 × 1 — non-batched upload passes; the batched variant exits 1.

**Action:** repro standalone-only; could be a regression in batch ordering against the alpha standalone.

---

## M. `schema create-migrations` exits 1 (CLI)

**Tests:** M08 × 2 — `schema create-migrations` is documented as offline (no network) yet exits 1 even with valid input. Round-trip test fails downstream.

**Action:** capture stderr and file as a regression.

---

## N. Mutually-exclusive auth conflict surfaces as `unauthorized` instead of "conflict" (CLI)

**Test:** M10 × 1 — passing both `?token=` in URL and `REVISIUM_TARGET_TOKEN` env should fail with a "mutually exclusive" message; today it fails as `unauthorized` after the conflicting credentials cancel each other out.

**Action:** add explicit conflict detection (also tracked under common-flags work).

---

## Snapshot

| Suite                            | pass / total | category of failures                                  |
| -------------------------------- | ------------ | ----------------------------------------------------- |
| M01 — auth commands              | 4 / 7        | A                                                     |
| M02 — instance commands          | 3 / 6        | B, C, D                                               |
| M03 — context commands           | 3 / 5        | B, E                                                  |
| M04 — project ensure             | 4 / 6        | F, G                                                  |
| M05 — endpoint commands          | 5 / 5        | —                                                     |
| M06 — example bootstrap          | 16 / 17      | I                                                     |
| M07 — migrate                    | 5 / 5        | —                                                     |
| M08 — schema                     | 1 / 3        | M                                                     |
| M09 — rows save / upload         | 2 / 3        | L                                                     |
| M10 — sync                       | 0 / 4        | H, N                                                  |
| M11 — target & auth resolution   | 3 / 6        | F, G                                                  |
| M12 — error paths                | 5 / 7        | J, K                                                  |
| M13 — authMode none              | 3 / 3        | —                                                     |
| M14 — multi-instance workspace   | 1 / 2        | A                                                     |

## Reproducing

```sh
# install pinned alpha standalone (devDep already updated in package.json)
npm ci

# full matrix
REVISIUM_CLI_PACKAGE=revisium@2.5.0-alpha.0 npm run test:e2e:matrix

# focused suite (e.g. M10 sync)
REVISIUM_CLI_PACKAGE=revisium@2.5.0-alpha.0 \
  npm run test:e2e:matrix -- --testPathPattern=M10

# stream standalone logs
E2E_STANDALONE_LOGS=1 REVISIUM_CLI_PACKAGE=revisium@2.5.0-alpha.0 \
  npm run test:e2e:matrix -- --testPathPattern=M12
```
