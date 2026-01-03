# Configuration

## Environment Variables

All commands support configuration via environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `REVISIUM_URL` | Revisium URL with host/org/project/branch | `revisium://cloud.revisium.io/org/proj/main` |
| `REVISIUM_TOKEN` | JWT authentication token | - |
| `REVISIUM_USERNAME` | Username (for password auth) | - |
| `REVISIUM_PASSWORD` | Password (for password auth) | - |

See [URL Format](./url-format.md) for complete URL syntax.

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
revisium schema save --folder ./schemas \
  --url revisium://api.example.com/my-org/my-project/develop
```

## Priority

Configuration is resolved in this order (highest to lowest):

1. **Command-line options** (`--url`)
2. **Environment variables** (`REVISIUM_URL`, `REVISIUM_TOKEN`, etc.)
3. **Interactive prompts** (for missing values)

## Examples

### Development vs Production

```bash
# Development (uses .env defaults)
revisium rows upload --folder ./data

# Production (override with CLI)
revisium rows upload --folder ./data \
  --url revisium://prod.example.com/prod-org/main-app/master?token=$PROD_TOKEN
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
- [URL Format](./url-format.md) - Revisium URL syntax
