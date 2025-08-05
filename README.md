## Revisium CLI README

This document describes how to configure and use the `revisium` command-line tool for saving and applying migrations.

---

### Configuration via `.env`

Create a `.env` file in your project root and set the following variables:

```dotenv
REVISIUM_API_URL=http://localhost:8080       # Base URL of Revisium API
REVISIUM_USERNAME=                           # Your Revisium username
REVISIUM_PASSWORD=                           # Your Revisium password
REVISIUM_ORGANIZATION=                       # Target organization name
REVISIUM_PROJECT=                            # Target project name
REVISIUM_BRANCH=                             # Target branch name (e.g., 'master', 'draft')
```

> **Note:** You don’t need an API key for now; authentication is handled via username/password or existing session.

---

### Commands

Revisium CLI provides two main commands under the `migrate` namespace. **The `--file` option is required** for both commands.

#### 1. Save Migrations

Fetches current migrations from Revisium and saves them to a JSON file.

```shell
npx revisium migrate save --file ./migrations.json
```

**Options:**

| Flag                         | Description         | Required         |
| ---------------------------- | ------------------- | ---------------- |
| `-f`, `--file <path>`        | Path to output file | yes              |
| `-o`, `--organization <org>` | Organization name   | no (env default) |
| `-p`, `--project <proj>`     | Project name        | no (env default) |
| `-b`, `--branch <branch>`    | Branch name         | no (env default) |

Usage:

```shell
# must specify --file
npx revisium migrate save --file=./custom.json
# you can also override org/project/branch
npx revisium migrate save --file=./migrations.json --project=my-project --branch=dev
```

#### 2. Apply Migrations

Validates and applies migrations from a JSON file to the target Revisium instance.

```shell
npx revisium migrate apply --file ./migrations.json
```

**Options:**

| Flag                         | Description        | Required         |
| ---------------------------- | ------------------ | ---------------- |
| `-f`, `--file <path>`        | Path to input file | yes              |
| `-o`, `--organization <org>` | Organization name  | no (env default) |
| `-p`, `--project <proj>`     | Project name       | no (env default) |
| `-b`, `--branch <branch>`    | Branch name        | no (env default) |

Usage:

```shell
# must specify --file
npx revisium migrate apply --file=./prod-migrations.json
# you can also override org/project/branch
npx revisium migrate apply --file=./migrations.json --organization=acme --branch=prod
```

---

### CLI Help Output

To see the full command reference, run:

```shell
npx revisium --help
```

Example:

```
$ npx revisium migrate -h
Usage: revisium migrate [options] [command]

Options:
  -h, --help            display help for command

Commands:
  apply [options]       Validate and process migration files
  save [options]        Save migrations to file
```

Detailed help for sub-commands:

```shell
npx revisium migrate apply -h
```

```
Usage: revisium migrate apply [options]

Validate and process migration files

Options:
  -f, --file <file>                  JSON file to validate (required)
  -o, --organization <organization>  organization name (env: $REVISIUM_ORGANIZATION)
  -p, --project <project>            project name (env: $REVISIUM_PROJECT)
  -b, --branch <branch>              branch name (env: $REVISIUM_BRANCH)
  -h, --help                         display help for command
```

```shell
npx revisium migrate save -h
```

```
Usage: revisium migrate save [options]

Save migrations to file

Options:
  -f, --file <file>                  file to save migrations (required)
  -o, --organization <organization>  organization name (env: $REVISIUM_ORGANIZATION)
  -p, --project <project>            project name (env: $REVISIUM_PROJECT)
  -b, --branch <branch>              branch name (env: $REVISIUM_BRANCH)
  -h, --help                         display help for command
```

---

> *Make sure to keep your `.env` out of version control by adding it to `.gitignore`.*
