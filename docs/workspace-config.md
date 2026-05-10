# Workspace Config

Workspace config lets local projects keep non-secret Revisium targets in git so repeated commands do not need `--url`.

The CLI discovers the nearest config by walking up from the current directory:

```text
.revisium/revisium-cli.config.json
```

This file stores instance aliases, context aliases, and the active context. It must not store API keys, JWTs, passwords, or URLs with `?token=...` / `?apikey=...`.

## Local Standalone

For standalone started without auth, use an explicit no-auth instance:

```bash
revisium instance add local --url revisium://localhost:9222 --auth none
revisium context create dictionary-local \
  --url revisium://localhost:9222/admin/dictionary/master
revisium context use dictionary-local
```

CLI input may use the Revisium URL scheme. The saved instance `baseUrl` is normalized to the transport URL,
such as `http://localhost:9222` or `https://cloud.revisium.io`, when written to `.revisium/revisium-cli.config.json`.

Then normal single-target commands can omit `--url`:

```bash
revisium schema save --folder ./schemas
revisium migrate apply --file ./migrations.json
revisium rows upload --folder ./data
```

When a command resolves its target from workspace config, it prints the selected context and instance:

```text
Using context dictionary-local (instance: local)
```

To inspect the current context without running a data command:

```bash
revisium context show
```

This is intended for examples and local demo projects. The committed config contains the server location and target metadata:
organization, project, branch, and revision. It should not contain credentials.

## Authenticated Instances

For authenticated local use, keep the target in workspace config and save API keys in the operating system credential store:

```bash
revisium instance add cloud --url revisium://cloud.revisium.io --auth stored
revisium context create dictionary-cloud \
  --url revisium://cloud.revisium.io/admin/dictionary/master \
  --credential default
revisium context use dictionary-cloud

revisium auth login --instance cloud --api-key
revisium schema save --folder ./schemas
```

`authMode: "stored"` resolves the selected named credential after explicit URL and environment credentials. The optional context `credential` field selects the saved credential name and defaults to `default` when omitted. API keys are stored outside the workspace under a key based on normalized instance base URL plus credential name, so workspace aliases can differ between projects without moving the secret.

For CI, prefer environment variables instead of saved local credentials:

```bash
export REVISIUM_API_KEY=rev_xxxxxxxxxxxxxxxxxxxx
revisium schema save --folder ./schemas
```

URL-embedded credentials such as `revisium://user:pass@host`, `?token=...`, and `?apikey=...` remain supported for compatibility
and emergencies, but avoid them in normal usage because they can leak through shell history, process listings, and logs.

## Commands

```bash
revisium instance add <name> --url <revisium-server-url> [--auth none|stored]
revisium instance list
revisium instance show <name>
revisium instance remove <name>

revisium auth login (--instance <name> | --url <revisium-url>) [--credential <name>] (--api-key | --api-key-stdin) [--force]
revisium auth status [--instance <name> | --url <revisium-url>] [--credential <name>]
revisium auth logout [--instance <name> | --url <revisium-url>] [--credential <name>]

revisium context create <name> --url <revisium-url> [--instance <name>] [--credential <name>]
revisium context create <name> --instance <name> --org <org> --project <project> [--branch <branch>] [--revision <revision>]
revisium context list
revisium context show [name]
revisium context use <name>
revisium context remove <name>
```

`context create --url` uses an existing instance with the same server base URL. If no matching instance exists, add it first with `revisium instance add`.

## Config Shape

```json
{
  "version": 1,
  "currentContext": "dictionary-local",
  "instances": {
    "local": {
      "baseUrl": "http://localhost:9222",
      "authMode": "none"
    }
  },
  "contexts": {
    "dictionary-local": {
      "instance": "local",
      "organization": "admin",
      "project": "dictionary",
      "branch": "master",
      "revision": "draft"
    }
  }
}
```

## Precedence

For single-target commands, command target options win first: `--url` selects an explicit URL, and `--context` selects a workspace context. `REVISIUM_URL` is used only when no command target option is provided. The current workspace context is used only when no command target option and no `REVISIUM_URL` are provided.

Authentication remains explicit:

1. URL auth, discouraged except for compatibility or emergencies: `?token=...`, `?apikey=...`, or `user:password@host`
2. Environment auth: `REVISIUM_TOKEN` > `REVISIUM_API_KEY` > `REVISIUM_USERNAME` / `REVISIUM_PASSWORD`
3. Workspace `authMode: "none"`
4. Stored API-key credentials when the instance uses `authMode: "stored"`
5. Interactive prompt for non-workspace URL flows

Sync commands still use `--source`, `--target`, and the `REVISIUM_SOURCE_*` / `REVISIUM_TARGET_*` environment variables.
