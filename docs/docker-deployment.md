# Docker Deployment

The CLI is available as a Docker image for CI/CD pipelines and containerized environments.

## Docker Image

```bash
# Pull official image
docker pull revisium/revisium-cli

# Or specific version
docker pull revisium/revisium-cli:2.0.0
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `REVISIUM_URL` | Revisium URL (see [URL Format](./url-format.md)) | Yes |
| `REVISIUM_TOKEN` | JWT authentication token | Yes* |
| `REVISIUM_USERNAME` | Username (alternative to token) | Yes* |
| `REVISIUM_PASSWORD` | Password (alternative to token) | Yes* |
| `MIGRATIONS_FILE` | Path to migrations file | No |
| `DATA_DIR` | Path to data directory | No |

*Either `REVISIUM_TOKEN` or `REVISIUM_USERNAME`/`REVISIUM_PASSWORD` is required.

## CI/CD Workflow (Prisma-like)

Revisium CLI follows a similar pattern to Prisma migrations:

1. **Local development**: Create/update schemas in Revisium UI, save migrations to file
2. **Version control**: Commit migrations file with your code
3. **CI/CD deployment**: Apply migrations automatically on deploy

### Step 1: Save Migrations Locally

```bash
# Save current schema migrations to file
revisium migrate save --file ./revisium/migrations.json \
  --url revisium://cloud.revisium.io/myorg/myproject/main?token=$TOKEN
```

### Step 2: Commit to Version Control

```bash
git add revisium/migrations.json
git commit -m "Add new schema migrations"
git push
```

### Step 3: Apply in CI/CD

```yaml
# GitHub Actions
steps:
  - uses: actions/checkout@v4

  - name: Apply Revisium Migrations
    run: |
      npx revisium migrate apply \
        --file ./revisium/migrations.json \
        --commit \
        --url revisium://cloud.revisium.io/$ORG/$PROJECT/main
    env:
      REVISIUM_USERNAME: ${{ secrets.REVISIUM_USERNAME }}
      REVISIUM_PASSWORD: ${{ secrets.REVISIUM_PASSWORD }}
```

### package.json Scripts

Add scripts to your package.json (like in Prisma):

```json
{
  "scripts": {
    "revisium:save-migrations": "revisium migrate save --file ./revisium/migrations.json --url $REVISIUM_URL",
    "revisium:apply-migrations": "revisium migrate apply --file ./revisium/migrations.json --commit --url $REVISIUM_URL"
  }
}
```

Production start script example:

```json
{
  "scripts": {
    "start:prod": "npm run revisium:apply-migrations && npm run prisma:migrate:deploy && node dist/main"
  }
}
```

## Docker Init Container (Kubernetes)

Use migrations in Kubernetes with init container for schema deployment:

### Build Custom Image with Migrations

```dockerfile
FROM revisium/revisium-cli:2.0.0

# Copy migrations
COPY revisium/migrations.json /app/migrations.json

# Optional: Copy seed data
# COPY revisium/data/ /app/data/
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    spec:
      initContainers:
        - name: revisium-migrate
          image: my-registry/my-app-migrations:v1.0.0
          command: ["revisium"]
          args:
            - migrate
            - apply
            - --file=/app/migrations.json
            - --commit
          env:
            - name: REVISIUM_URL
              value: "revisium://revisium.example.com/myorg/myproject/main"
            - name: REVISIUM_USERNAME
              valueFrom:
                secretKeyRef:
                  name: revisium-credentials
                  key: username
            - name: REVISIUM_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: revisium-credentials
                  key: password
      containers:
        - name: app
          image: my-registry/my-app:v1.0.0
```

## Data Seeding

For initial data seeding, include data files in your Docker image:

### Dockerfile with Data

```dockerfile
FROM revisium/revisium-cli:2.0.0

# Copy migrations
COPY revisium/migrations.json /app/migrations.json

# Copy seed data
COPY revisium/data/ /app/data/
```

### Kubernetes Job for Seeding

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: revisium-seed
spec:
  template:
    spec:
      containers:
        - name: revisium-cli
          image: my-registry/my-app-seed:v1.0.0
          command: ["/bin/sh", "-c"]
          args:
            - |
              revisium migrate apply --file /app/migrations.json --commit && \
              revisium rows upload --folder /app/data --commit
          env:
            - name: REVISIUM_URL
              value: "revisium://revisium.example.com/myorg/myproject/main"
            - name: REVISIUM_USERNAME
              valueFrom:
                secretKeyRef:
                  name: revisium-credentials
                  key: username
            - name: REVISIUM_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: revisium-credentials
                  key: password
      restartPolicy: OnFailure
```

## GitHub Actions Examples

### Basic Migration Apply

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Apply Revisium Migrations
        run: npx revisium migrate apply --file ./revisium/migrations.json --commit
        env:
          REVISIUM_URL: revisium://cloud.revisium.io/${{ vars.ORG }}/${{ vars.PROJECT }}/main
          REVISIUM_USERNAME: ${{ secrets.REVISIUM_USERNAME }}
          REVISIUM_PASSWORD: ${{ secrets.REVISIUM_PASSWORD }}
```

### With Docker Image

```yaml
name: Deploy with Docker

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Apply Revisium Migrations
        run: |
          docker run --rm \
            -e REVISIUM_URL=revisium://cloud.revisium.io/$ORG/$PROJECT/main \
            -e REVISIUM_USERNAME=${{ secrets.REVISIUM_USERNAME }} \
            -e REVISIUM_PASSWORD=${{ secrets.REVISIUM_PASSWORD }} \
            -v ${{ github.workspace }}/revisium/migrations.json:/app/migrations.json \
            revisium/revisium-cli \
            revisium migrate apply --file /app/migrations.json --commit
        env:
          ORG: ${{ vars.REVISIUM_ORG }}
          PROJECT: ${{ vars.REVISIUM_PROJECT }}
```

### Full Pipeline with Migrations and Data

```yaml
name: Full Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install CLI
        run: npm install -g revisium

      - name: Apply Schema Migrations
        run: revisium migrate apply --file ./revisium/migrations.json --commit
        env:
          REVISIUM_URL: revisium://cloud.revisium.io/${{ vars.ORG }}/${{ vars.PROJECT }}/main
          REVISIUM_USERNAME: ${{ secrets.REVISIUM_USERNAME }}
          REVISIUM_PASSWORD: ${{ secrets.REVISIUM_PASSWORD }}

      - name: Upload Seed Data (optional)
        if: github.ref == 'refs/heads/main'
        run: revisium rows upload --folder ./revisium/data --commit
        env:
          REVISIUM_URL: revisium://cloud.revisium.io/${{ vars.ORG }}/${{ vars.PROJECT }}/main
          REVISIUM_USERNAME: ${{ secrets.REVISIUM_USERNAME }}
          REVISIUM_PASSWORD: ${{ secrets.REVISIUM_PASSWORD }}
```

## Manual Commands

Run CLI commands directly with Docker:

```bash
# Apply migrations
docker run --rm \
  -e REVISIUM_URL=revisium://cloud.revisium.io/myorg/myproject/main \
  -e REVISIUM_USERNAME=admin \
  -e REVISIUM_PASSWORD=secret \
  -v ./revisium/migrations.json:/app/migrations.json \
  revisium/revisium-cli \
  revisium migrate apply --file /app/migrations.json --commit

# Upload data
docker run --rm \
  -e REVISIUM_URL=revisium://cloud.revisium.io/myorg/myproject/main \
  -e REVISIUM_USERNAME=admin \
  -e REVISIUM_PASSWORD=secret \
  -v ./data:/app/data \
  revisium/revisium-cli \
  revisium rows upload --folder /app/data --commit
```

## See Also

- [URL Format](./url-format.md) - URL syntax
- [Authentication](./authentication.md) - Auth methods
- [Migrate Commands](./migrate-commands.md) - Migration commands reference
- [Rows Commands](./rows-commands.md) - Data upload commands reference
