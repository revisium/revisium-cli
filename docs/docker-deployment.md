# Docker Deployment

The CLI is available as a Docker image for CI/CD pipelines and containerized environments.

## Docker Image

```bash
# Pull official image
docker pull revisium/revisium-cli

# Or specific version
docker pull revisium/revisium-cli:1.0.0
```

## Automated Entrypoint

The Docker image includes an entrypoint script that automatically:

1. **Applies migrations** from `/app/migrations.json` (if exists)
2. **Uploads data** from `/app/data/` (if exists)
3. **Creates revisions** when commit flags are enabled

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `REVISIUM_API_URL` | API endpoint | - | Yes |
| `REVISIUM_USERNAME` | Username | - | Yes |
| `REVISIUM_PASSWORD` | Password | - | Yes |
| `REVISIUM_ORGANIZATION` | Organization name | - | Yes |
| `REVISIUM_PROJECT` | Project name | - | Yes |
| `REVISIUM_BRANCH` | Branch name | - | Yes |
| `REVISIUM_MIGRATE_COMMIT` | Auto-commit after migrations | `false` | No |
| `REVISIUM_UPLOAD_COMMIT` | Auto-commit after data upload | `false` | No |
| `MIGRATIONS_FILE` | Path to migrations file | `/app/migrations.json` | No |
| `DATA_DIR` | Path to data directory | `/app/data` | No |
| `DRY_RUN` | Preview mode | `false` | No |

## Custom Deployment Image

Create your own image with migrations and data:

**Dockerfile:**

```dockerfile
FROM revisium/revisium-cli:latest

# Copy migrations and data
COPY migrations.json /app/migrations.json
COPY data/ /app/data/
```

**docker-compose.yml:**

```yaml
version: '3.9'

services:
  revisium-deploy:
    build: .
    environment:
      REVISIUM_API_URL: 'https://api.revisium.example.com'
      REVISIUM_USERNAME: 'deploy-user'
      REVISIUM_PASSWORD: 'secure-password'
      REVISIUM_ORGANIZATION: 'production'
      REVISIUM_PROJECT: 'main-app'
      REVISIUM_BRANCH: 'master'
      REVISIUM_MIGRATE_COMMIT: 'true'
      REVISIUM_UPLOAD_COMMIT: 'true'
```

## Kubernetes

Use as a Job for automated deployments:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: revisium-migration
spec:
  template:
    spec:
      containers:
        - name: revisium-cli
          image: my-registry/my-app-migrations:v1.0.0
          env:
            - name: REVISIUM_API_URL
              value: 'https://revisium.example.com'
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
            - name: REVISIUM_ORGANIZATION
              value: 'production'
            - name: REVISIUM_PROJECT
              value: 'main-app'
            - name: REVISIUM_BRANCH
              value: 'master'
            - name: REVISIUM_MIGRATE_COMMIT
              value: 'true'
            - name: REVISIUM_UPLOAD_COMMIT
              value: 'true'
      restartPolicy: OnFailure
```

## GitHub Actions

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Revisium
        run: |
          docker run --rm \
            -e REVISIUM_API_URL=${{ secrets.REVISIUM_API_URL }} \
            -e REVISIUM_USERNAME=${{ secrets.REVISIUM_USERNAME }} \
            -e REVISIUM_PASSWORD=${{ secrets.REVISIUM_PASSWORD }} \
            -e REVISIUM_ORGANIZATION=production \
            -e REVISIUM_PROJECT=main-app \
            -e REVISIUM_BRANCH=master \
            -e REVISIUM_MIGRATE_COMMIT=true \
            -e REVISIUM_UPLOAD_COMMIT=true \
            -v ${{ github.workspace }}/migrations.json:/app/migrations.json \
            -v ${{ github.workspace }}/data:/app/data \
            revisium/revisium-cli
```

## Manual Commands

Run CLI commands directly:

```bash
# Run specific command
docker run --rm \
  -e REVISIUM_API_URL=https://api.example.com \
  -e REVISIUM_USERNAME=admin \
  -e REVISIUM_PASSWORD=secret \
  -e REVISIUM_ORGANIZATION=myorg \
  -e REVISIUM_PROJECT=myproject \
  -e REVISIUM_BRANCH=master \
  -v ./data:/app/data \
  revisium/revisium-cli \
  revisium rows upload --folder /app/data --commit
```
