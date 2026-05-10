# Configuration

## Workspace Config

Single-target commands can use a workspace config at `.revisium/revisium-cli.config.json` when no `--url` and no `REVISIUM_URL` are provided.

```bash
revisium instance add local --url revisium://localhost:9222 --auth none
revisium context create dictionary-local \
  --url revisium://localhost:9222/admin/dictionary/master
revisium context use dictionary-local

revisium schema save --folder ./schemas
```

The workspace config stores only non-secret instance and context data. API keys can be saved in the operating system credential store with `revisium auth login`; tokens and passwords should stay in environment variables or explicit URL/auth inputs.

See [Workspace Config](./workspace-config.md).

## Environment Variables

All commands support configuration via environment variables.

### Single-Endpoint Commands (schema, migrate, rows)

| Variable            | Description                                      | Example                                      |
| ------------------- | ------------------------------------------------ | -------------------------------------------- |
| `REVISIUM_URL`      | Revisium URL (see [URL Format](./url-format.md)) | `revisium://cloud.revisium.io/org/proj/main` |
| `REVISIUM_TOKEN`    | JWT authentication token                         | `eyJhbGciOiJIUzI1NiIs...`                    |
| `REVISIUM_API_KEY`  | API key (for automated access)                   | `rev_xxxxxxxxxxxxx`                          |
| `REVISIUM_USERNAME` | Username (for password auth)                     | `admin`                                      |
| `REVISIUM_PASSWORD` | Password (for password auth)                     | `secret`                                     |

### Sync Commands (source/target)

| Variable                   | Description        |
| -------------------------- | ------------------ |
| `REVISIUM_SOURCE_URL`      | Source project URL |
| `REVISIUM_SOURCE_TOKEN`    | Source JWT token   |
| `REVISIUM_SOURCE_API_KEY`  | Source API key     |
| `REVISIUM_SOURCE_USERNAME` | Source username    |
| `REVISIUM_SOURCE_PASSWORD` | Source password    |
| `REVISIUM_TARGET_URL`      | Target project URL |
| `REVISIUM_TARGET_TOKEN`    | Target JWT token   |
| `REVISIUM_TARGET_API_KEY`  | Target API key     |
| `REVISIUM_TARGET_USERNAME` | Target username    |
| `REVISIUM_TARGET_PASSWORD` | Target password    |

### Authentication Priority

For explicit URLs and environment targets, authentication is resolved in this order:

1. **URL query parameter** - `?token=...` or `?apikey=...`
2. **URL credentials** - `user:pass@host`
3. **Environment variable** - `REVISIUM_TOKEN` > `REVISIUM_API_KEY` > `REVISIUM_USERNAME/PASSWORD`
4. **Interactive prompt** - if running in terminal

When a workspace context is used, URL and environment auth still win. If the selected instance has `authMode: "none"`, the CLI sends no auth. If the selected instance has `authMode: "stored"`, the CLI reads the selected named API-key credential from the operating system credential store.

```bash
revisium auth login --instance cloud --credential default --api-key
revisium auth status --instance cloud
```

**Important:** You can use `--url` to specify host/org/project/branch and provide credentials via environment:

```bash
# URL specifies target, credentials from environment
export REVISIUM_TOKEN=$MY_TOKEN
revisium migrate apply --file ./migrations.json \
  --url revisium://cloud.revisium.io/myorg/myproject/master
```

## .env File

Create a `.env` file in your project directory:

```env
# Recommended: URL + Token
REVISIUM_URL=revisium://cloud.revisium.io/your_organization/your_project/master
REVISIUM_TOKEN=your_jwt_token

# Alternative: URL + Username/Password
REVISIUM_URL=revisium://cloud.revisium.io/your_organization/your_project/master
REVISIUM_USERNAME=your_username
REVISIUM_PASSWORD=your_password
```

## Custom Environment File

Use `REVISIUM_ENV_FILE` to specify a custom environment file:

```bash
# Absolute path
export REVISIUM_ENV_FILE=/path/to/custom.env
revisium schema save --folder ./schemas

# Relative path
export REVISIUM_ENV_FILE=./config/production.env
revisium migrate apply --file ./migrations.json
```

## Command-Line Options

Override environment variables with CLI options:

```bash
# Full URL with token in query parameter
revisium schema save --folder ./schemas \
  --url revisium://cloud.revisium.io/my-org/my-project/develop?token=$TOKEN

# URL without credentials (uses REVISIUM_TOKEN from environment)
export REVISIUM_TOKEN=$MY_TOKEN
revisium schema save --folder ./schemas \
  --url revisium://cloud.revisium.io/my-org/my-project/develop

# URL with credentials in URL
revisium schema save --folder ./schemas \
  --url revisium://admin:secret@localhost:8080/my-org/my-project/develop
```

## Priority

Configuration is resolved in this order (highest to lowest):

1. **Command-line target options** (`--url`, `--context`)
2. **Environment variables** (`REVISIUM_URL`, `REVISIUM_TOKEN`, etc.)
3. **Current workspace context** (`.revisium/revisium-cli.config.json`)
4. **Saved API-key credential** for stored workspace contexts
5. **Interactive prompts** (for missing values)

## Examples

### Development vs Production

```bash
# Development (uses .env defaults)
revisium rows upload --folder ./data

# Production with token in URL
revisium rows upload --folder ./data --commit \
  --url revisium://prod.example.com/prod-org/main-app/master?token=$PROD_TOKEN

# Production with token in environment (recommended for CI/CD)
export REVISIUM_TOKEN=$PROD_TOKEN
revisium rows upload --folder ./data --commit \
  --url revisium://prod.example.com/prod-org/main-app/master
```

### Multiple Environments

```bash
# Using different .env files
REVISIUM_ENV_FILE=./config/staging.env revisium migrate apply --file ./migrations.json
REVISIUM_ENV_FILE=./config/production.env revisium migrate apply --file ./migrations.json
```

### CI/CD Pipeline

```yaml
# GitHub Actions example
env:
  REVISIUM_URL: revisium://cloud.revisium.io/production/main-app/master
  REVISIUM_USERNAME: ${{ secrets.REVISIUM_USERNAME }}
  REVISIUM_PASSWORD: ${{ secrets.REVISIUM_PASSWORD }}
```

## See Also

- [Authentication](./authentication.md) - Token, API key, and password auth
- [Workspace Config](./workspace-config.md) - workspace instances and contexts
- [URL Format](./url-format.md) - Revisium URL syntax
