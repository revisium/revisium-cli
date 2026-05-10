# Concepts

The CLI works with two layers of primitives: **product concepts** (defined by Revisium itself, the same on every client) and **CLI primitives** (workspace-level helpers that exist only in this tool's config).

## Product concepts

These describe how Revisium models data on the server. The CLI accepts and produces them but doesn't define them — see [docs.revisium.io](https://docs.revisium.io) for the canonical reference.

| Concept    | One-liner                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Organization | Top-level tenant (e.g. `admin`).                                                                     |
| Project    | A collection of branches owned by an organization.                                                     |
| Branch     | A line of revisions, like a Git branch (default: `master`).                                            |
| Revision   | An immutable snapshot of all tables and rows. A branch points at a `head` revision and a `draft`.      |
| Table      | A typed collection of rows; the schema is JSON Schema.                                                 |
| Row        | One record in a table, identified by `rowId`.                                                          |
| Endpoint   | A generated REST or GraphQL surface exposing one revision.                                             |

A Revisium target on the wire is `revisium://host[:port]/<org>/<project>/<branch>[:<revision>]`. The CLI parses this format anywhere a `--url` flag is accepted; see [URL Format](url-format.md).

## CLI primitives

These are workspace-local conveniences saved in `.revisium/revisium-cli.config.json`. They don't exist on the server.

| Primitive  | What it is                                                                                                                | Stored?                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Instance   | An alias for a Revisium server (`local`, `cloud`, `staging`, …) — base URL plus an auth mode (`none` or `stored`).         | Workspace config (non-secret).                       |
| Context    | A default target inside an instance — organization, project, branch, optional revision and credential name.               | Workspace config (non-secret).                       |
| Credential | A named API key for an instance (default name is `default`).                                                              | OS keyring via `revisium auth login`. Never on disk. |

A workspace can hold many instances and contexts, with one **current context** that single-target commands use when neither `--url` nor `--context` is passed.

## How they fit together

```text
revisium-cli.config.json               OS keyring                  Revisium server
─────────────────────────               ──────────                  ───────────────
instances.local                                                    revisium://localhost:9222
└─ baseUrl, authMode "stored"           credential "default" ──→   bearer / X-Api-Key
contexts.dictionary-local                                          /admin/dictionary/master:draft
└─ instance, organization, project, branch, revision, credential
currentContext: dictionary-local
```

When you run `revisium <command>`, the CLI resolves a target in this precedence order:

1. Explicit flags: `--url`, `--context`, `--token`.
2. URL-embedded auth: `?token=…`, `?apikey=…`, `user:password@host`.
3. Environment: `REVISIUM_URL`, `REVISIUM_TOKEN`, `REVISIUM_API_KEY`, `REVISIUM_USERNAME` / `REVISIUM_PASSWORD`.
4. The current workspace context (if any), with its saved credential from the OS keyring.
5. Interactive prompt — only when stdin is a TTY.

(`--api-key` and `--api-key-stdin` are inputs to `auth login` itself — they tell the CLI which key to *save*, not which key the next command should use.)

`auth login` saves a credential under `service: revisium-cli, account: instance:<baseUrl>|credential:<name>`. `auth logout` removes it.

## Where to read next

- [Quickstart](quickstart.md) — boot a local Revisium and run the CLI against it.
- [Common workflows](workflows.md) — named recipes for migrations, sync, and portability.
- [Workspace Config](workspace-config.md) — the full file shape and discovery rules.
- [Authentication](authentication.md) — every supported auth method, with priority and remediation hints.
- [URL Format](url-format.md) — the `revisium://` URL grammar.
