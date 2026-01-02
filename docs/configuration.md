# Configuration

## Environment Variables

All commands support configuration via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `REVISIUM_API_URL` | API base URL | `https://cloud.revisium.io/` |
| `REVISIUM_USERNAME` | Username for authentication | - |
| `REVISIUM_PASSWORD` | Password for authentication | - |
| `REVISIUM_ORGANIZATION` | Organization name | - |
| `REVISIUM_PROJECT` | Project name | - |
| `REVISIUM_BRANCH` | Branch name | `master` |

## .env File

Create a `.env` file in your project directory:

```env
REVISIUM_API_URL=https://cloud.revisium.io/
REVISIUM_USERNAME=your_username
REVISIUM_PASSWORD=your_password
REVISIUM_ORGANIZATION=your_organization
REVISIUM_PROJECT=your_project
REVISIUM_BRANCH=master
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

Override any environment variable with CLI options:

```bash
revisium schema save --folder ./schemas \
  --url http://api.example.com \
  --organization my-org \
  --project my-project \
  --branch develop
```

## Priority

Configuration is resolved in this order (highest to lowest):

1. **Command-line options** (`--url`, `--organization`, etc.)
2. **Environment variables** (`REVISIUM_*`)
3. **Default values**

## Examples

### Development vs Production

```bash
# Development (uses .env defaults)
revisium rows upload --folder ./data

# Production (override with CLI)
revisium rows upload --folder ./data \
  --url https://prod.example.com \
  --organization prod-org
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
  REVISIUM_API_URL: ${{ secrets.REVISIUM_API_URL }}
  REVISIUM_USERNAME: ${{ secrets.REVISIUM_USERNAME }}
  REVISIUM_PASSWORD: ${{ secrets.REVISIUM_PASSWORD }}
  REVISIUM_ORGANIZATION: production
  REVISIUM_PROJECT: main-app
  REVISIUM_BRANCH: master
```
