# CLI Usage Guide

This guide provides detailed usage information for all Revisium CLI commands.

## Command Structure

```
revisium
├── schema
│   ├── save --folder <path>
│   └── create-migrations --schemas-folder <path> --file <file>
├── migrate
│   ├── save --file <file>
│   └── apply --file <file> [--commit]
└── rows
    ├── save --folder <path> [--tables <list>]
    └── upload --folder <path> [--tables <list>] [--commit]
```

## Global Options

All commands support these authentication and connection options:

| Option | Description | Environment Variable | Default |
|--------|-------------|---------------------|---------|
| `--url <url>` | API base URL | `REVISIUM_API_URL` | `https://cloud.revisium.io/` |
| `--username <name>` | Username for authentication | `REVISIUM_USERNAME` | - |
| `--password <pass>` | Password for authentication | `REVISIUM_PASSWORD` | - |
| `-o, --organization <name>` | Organization name | `REVISIUM_ORGANIZATION` | - |
| `-p, --project <name>` | Project name | `REVISIUM_PROJECT` | - |
| `-b, --branch <name>` | Branch name | `REVISIUM_BRANCH` | `master` |

**Note**: All parameters are optional with sensible defaults. Command-line options take precedence over environment variables.

## Migration Commands

### `migrate save`
Export migrations from Revisium to a JSON file.

```bash
revisium migrate save --file ./migrations.json [options]
```

**Options:**

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-f, --file <path>` | Output file path | ✓ | - |
| `-o, --organization <name>` | Organization name | - | `$REVISIUM_ORGANIZATION` |
| `-p, --project <name>` | Project name | - | `$REVISIUM_PROJECT` |
| `-b, --branch <name>` | Branch name | - | `$REVISIUM_BRANCH` |
| `--url <url>` | API base URL | - | `$REVISIUM_API_URL` (defaults to `https://cloud.revisium.io/`) |
| `--username <name>` | Username | - | `$REVISIUM_USERNAME` |
| `--password <pass>` | Password | - | `$REVISIUM_PASSWORD` |

**Examples:**
```bash
# Export migrations using environment variables
revisium migrate save --file ./migrations.json

# Override specific options
revisium migrate save --file ./migrations.json --project my-project --branch dev

# Use different API server
revisium migrate save --file ./migrations.json --url http://staging.example.com
```

### `migrate apply`
Apply migrations from a JSON file to Revisium.

```bash
revisium migrate apply --file ./migrations.json [options]
```

**Options:**

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-f, --file <path>` | Input file path | ✓ | - |
| `-c, --commit` | Create a revision after applying migrations | - | `false` |
| `-o, --organization <name>` | Organization name | - | `$REVISIUM_ORGANIZATION` |
| `-p, --project <name>` | Project name | - | `$REVISIUM_PROJECT` |
| `-b, --branch <name>` | Branch name | - | `$REVISIUM_BRANCH` |
| `--url <url>` | API base URL | - | `$REVISIUM_API_URL` (defaults to `https://cloud.revisium.io/`) |
| `--username <name>` | Username | - | `$REVISIUM_USERNAME` |
| `--password <pass>` | Password | - | `$REVISIUM_PASSWORD` |

**Examples:**
```bash
# Apply migrations using environment variables
revisium migrate apply --file ./migrations.json

# Apply migrations and create a revision
revisium migrate apply --file ./migrations.json --commit

# Apply to specific environment
revisium migrate apply --file ./migrations.json --url http://production.example.com --organization prod-org

# Apply to production with automatic revision creation
revisium migrate apply --file ./migrations.json --url http://production.example.com --commit
```

## Schema Commands

### `schema save`
Export table schemas from Revisium to JSON files.

```bash
revisium schema save --folder ./schemas [options]
```

**Options:**

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-f, --folder <path>` | Output folder path | ✓ | - |
| `-o, --organization <name>` | Organization name | - | `$REVISIUM_ORGANIZATION` |
| `-p, --project <name>` | Project name | - | `$REVISIUM_PROJECT` |
| `-b, --branch <name>` | Branch name | - | `$REVISIUM_BRANCH` |
| `--url <url>` | API base URL | - | `$REVISIUM_API_URL` (defaults to `https://cloud.revisium.io/`) |
| `--username <name>` | Username | - | `$REVISIUM_USERNAME` |
| `--password <pass>` | Password | - | `$REVISIUM_PASSWORD` |

**Output Structure:**
```
schemas/
├── users.json
├── posts.json
├── comments.json
└── images.json
```

**Examples:**
```bash
# Export all schemas to ./schemas folder
revisium schema save --folder ./schemas

# Export schemas from specific branch
revisium schema save --folder ./dev-schemas --branch development

# Export from different server with authentication
revisium schema save --folder ./schemas --url http://api.example.com --username admin --password secret
```

### `schema create-migrations`
Convert saved schema files to migration format.

```bash
revisium schema create-migrations --schemas-folder ./schemas --file ./migrations.json
```

**Options:**

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `--schemas-folder <path>` | Folder containing schema JSON files | ✓ | - |
| `-f, --file <path>` | Output file for generated migrations | ✓ | - |

**Features:**
- **Dependency Analysis**: Automatically analyzes table dependencies based on foreign keys
- **Topological Sorting**: Orders migrations to respect foreign key constraints
- **Circular Dependency Detection**: Warns about circular dependencies
- **Schema Validation**: Validates generated migrations against JSON schema
- **Unique Timestamps**: Generates unique ISO date strings for migration IDs
- **Hash Generation**: Creates SHA256 hashes for schema integrity

**Example Workflow:**
```bash
# 1. Export schemas from source environment
revisium schema save --folder ./schemas --url http://source.example.com

# 2. Convert schemas to migrations
revisium schema create-migrations --schemas-folder ./schemas --file ./migrations.json

# 3. Apply migrations to target environment
revisium migrate apply --file ./migrations.json --url http://target.example.com
```

## Rows Commands

### `rows save`
Export table data from Revisium to JSON files.

```bash
revisium rows save --folder ./data [options]
```

**Options:**

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-f, --folder <path>` | Output folder path | ✓ | - |
| `-t, --tables <ids>` | Comma-separated table IDs | - | All tables |
| `-o, --organization <name>` | Organization name | - | `$REVISIUM_ORGANIZATION` |
| `-p, --project <name>` | Project name | - | `$REVISIUM_PROJECT` |
| `-b, --branch <name>` | Branch name | - | `$REVISIUM_BRANCH` |
| `--url <url>` | API base URL | - | `$REVISIUM_API_URL` (defaults to `https://cloud.revisium.io/`) |
| `--username <name>` | Username | - | `$REVISIUM_USERNAME` |
| `--password <pass>` | Password | - | `$REVISIUM_PASSWORD` |

**Output Structure:**
```
data/
├── users/
│   ├── user-123.json
│   ├── user-456.json
│   └── user-789.json
├── posts/
│   ├── post-abc.json
│   └── post-def.json
└── comments/
    ├── comment-xyz.json
    └── comment-uvw.json
```

**Examples:**
```bash
# Export all tables
revisium rows save --folder ./data

# Export specific tables only
revisium rows save --folder ./data --tables users,posts,comments

# Export from specific branch with custom authentication
revisium rows save --folder ./backup --branch production --username backup-user --password backup-pass
```

### `rows upload`
Upload table data from JSON files to Revisium.

```bash
revisium rows upload --folder ./data [options]
```

**Options:**

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-f, --folder <path>` | Folder path containing row files | ✓ | - |
| `-t, --tables <ids>` | Comma-separated table IDs | - | All tables found in folder |
| `-c, --commit` | Create a revision after uploading rows | - | `false` |
| `-o, --organization <name>` | Organization name | - | `$REVISIUM_ORGANIZATION` |
| `-p, --project <name>` | Project name | - | `$REVISIUM_PROJECT` |
| `-b, --branch <name>` | Branch name | - | `$REVISIUM_BRANCH` |
| `--url <url>` | API base URL | - | `$REVISIUM_API_URL` (defaults to `https://cloud.revisium.io/`) |
| `--username <name>` | Username | - | `$REVISIUM_USERNAME` |
| `--password <pass>` | Password | - | `$REVISIUM_PASSWORD` |

**Features:**
- **Schema Validation**: Validates data fields against table schema
- **Smart Upload**: Creates new rows or updates changed rows
- **Duplicate Detection**: Skips rows with identical data
- **Dependency Sorting**: Automatically sorts tables by foreign key dependencies
- **Circular Dependency Detection**: Warns about circular foreign key references
- **Statistics Reporting**: Shows uploaded/updated/skipped/error counts
- **Progress Tracking**: Real-time progress updates during upload

**Examples:**
```bash
# Upload all tables from folder
revisium rows upload --folder ./data

# Upload and create a revision
revisium rows upload --folder ./data --commit

# Upload specific tables only
revisium rows upload --folder ./data --tables users,posts,comments

# Upload specific tables and create a revision
revisium rows upload --folder ./data --tables users,posts --commit

# Upload to different environment
revisium rows upload --folder ./data --url http://staging.example.com --organization staging-org

# Upload to staging with automatic revision creation
revisium rows upload --folder ./data --url http://staging.example.com --organization staging-org --commit
```

## Revision Control with --commit Flag

The `--commit` flag is available for operations that modify data in Revisium (`migrate apply` and `rows upload`). When used, it automatically creates a revision after the operation completes successfully.

### How it Works

**Without --commit (default):**
- Changes are applied to the draft state
- You must manually create a revision later using the web interface
- ⚠️  Warning message displays: "Changes applied to draft. Use --commit to create a revision."

**With --commit:**
- Changes are applied to the draft state
- A revision is automatically created with a descriptive commit message
- ✅ Success message displays the new revision ID

### Commit Messages

The CLI automatically generates descriptive commit messages:

- **Migrations**: `"Applied X migrations via revisium-cli"` (where X is the number of applied migrations)
- **Row uploads**: `"Uploaded X items via revisium-cli"` (where X is the total number of uploaded and updated rows)

### Examples

```bash
# Apply migrations to draft only (default behavior)
revisium migrate apply --file ./migrations.json
# Output: ⚠️  Migrations applied to draft. Use --commit to create a revision.

# Apply migrations and create revision automatically
revisium migrate apply --file ./migrations.json --commit
# Output: ✅ Created revision: rev_abc123

# Upload data to draft only (default behavior)
revisium rows upload --folder ./data
# Output: ⚠️  Changes applied to draft. Use --commit to create a revision.

# Upload data and create revision automatically
revisium rows upload --folder ./data --commit
# Output: ✅ Created revision: rev_def456
```

### Best Practices

- **Use --commit for production deployments** to ensure changes are permanently recorded
- **Skip --commit for testing** to allow iterative changes without creating multiple revisions
- **Combine with specific environments** for controlled deployments:
  ```bash
  # Deploy to staging with revision
  revisium migrate apply --file ./migrations.json --url http://staging.example.com --commit
  
  # Deploy to production with revision
  revisium migrate apply --file ./migrations.json --url http://production.example.com --commit
  ```

## Authentication Methods

### Environment Variables (Optional)
Environment variables provide convenient defaults but are not required. Create a `.env` file in your project root:

```env
# Optional - API connection with defaults
REVISIUM_API_URL=https://cloud.revisium.io/  # Default: https://cloud.revisium.io/
REVISIUM_USERNAME=your_username              # Optional: authentication
REVISIUM_PASSWORD=your_password              # Optional: authentication

# Required for most operations
REVISIUM_ORGANIZATION=your_organization      # Required: target organization
REVISIUM_PROJECT=your_project                # Required: target project

# Optional - with default
REVISIUM_BRANCH=master                       # Default: 'master'
```

### Command-Line Options
Override environment variables with command-line options:

```bash
# Override API URL and credentials
revisium schema save --folder ./schemas \
  --url http://production.example.com \
  --username prod-user \
  --password prod-pass

# Override project context
revisium rows save --folder ./data \
  --organization my-org \
  --project my-project \
  --branch feature-branch
```

### Precedence Order
Command-line options take precedence over environment variables:

1. **Command-line options** (highest priority)
2. **Environment variables**
3. **Default values** (lowest priority)

## Error Handling

### Authentication Errors
- **Missing credentials**: CLI will skip authentication and attempt unauthenticated requests
- **Invalid credentials**: Returns authentication error from API
- **Network errors**: Displays connection error messages

### Configuration Errors
- **Missing required options**: Clear error message indicating which option is required
- **Invalid file paths**: File system error messages
- **Invalid API URL**: Network connection error

### Data Processing Errors
- **Schema validation**: Shows validation errors with field details
- **Dependency conflicts**: Warns about circular dependencies
- **API rate limits**: Retries with backoff strategy

## Advanced Usage

### Multi-Environment Workflows

```bash
# Export from development
revisium schema save --folder ./dev-schemas --branch development

# Create migrations for production deployment
revisium schema create-migrations --schemas-folder ./dev-schemas --file ./prod-migrations.json

# Apply to staging for testing
revisium migrate apply --file ./prod-migrations.json --url http://staging.example.com

# Apply to production with revision creation
revisium migrate apply --file ./prod-migrations.json --url http://production.example.com --commit
```

### Data Migration Between Environments

```bash
# Export data from source
revisium rows save --folder ./migration-data --url http://source.example.com

# Upload to target with revision creation (tables will be sorted by dependencies automatically)
revisium rows upload --folder ./migration-data --url http://target.example.com --commit
```

### Selective Table Operations

```bash
# Export only user-related tables
revisium rows save --folder ./user-data --tables users,user_profiles,user_settings

# Upload only specific tables
revisium rows upload --folder ./user-data --tables users,user_profiles
```

## Troubleshooting

### Common Issues

1. **Authentication failures**: Check credentials and API URL
2. **Permission errors**: Ensure user has proper access to organization/project
3. **Network timeouts**: Check network connectivity and API server status
4. **File system errors**: Verify folder permissions and disk space
5. **Schema validation errors**: Check data format against table schema

### Debug Information

Enable verbose output by checking the CLI logs for:
- Authentication success/failure messages
- API request/response details
- File operation progress
- Dependency analysis results
- Upload/download statistics

### Getting Help

```bash
# View all available commands
revisium --help

# View help for specific command
revisium schema --help
revisium migrate save --help
revisium rows upload --help
```