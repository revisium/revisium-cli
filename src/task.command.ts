import { Command, CommandRunner, Option } from 'nest-commander';
import { readFile } from 'fs/promises';
import Ajv from 'ajv';
import { migrationSchema } from 'src/config/migration.schema';
import { CoreApiService } from 'src/core-api.service';
import { Migration } from 'src/types/migration.types';
import { MigrationsModel } from 'src/__generated__/api';

@Command({
  name: 'migrate',
  description: 'Validate and process migration files',
})
export class TaskRunner extends CommandRunner {
  constructor(private readonly coreApiService: CoreApiService) {
    super();
  }

  private readonly ajv = new Ajv();

  async run(_inputs: string[], options: Record<string, string>): Promise<void> {
    if (!options.file) {
      console.error('Error: --file option is required');
      process.exit(1);
    }

    const jsonData = await this.validateJsonFile(options.file);
    await this.getMigrations(jsonData);
  }

  private async validateJsonFile(filePath: string) {
    try {
      const fileContent = await readFile(filePath, 'utf-8');
      const data: unknown = JSON.parse(fileContent);

      const validate = this.ajv.compile<Migration[]>(migrationSchema);
      const valid = validate(data);

      if (valid) {
        console.log('✅ JSON file is valid');
        console.log(`Validated ${data.length} items`);
      } else {
        console.log('❌ JSON file validation failed:');
        console.log(validate.errors);
        process.exit(1);
      }

      return data;
    } catch (error) {
      console.error(
        'Error reading or parsing file:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }

  private async getMigrations(jsonData: Migration[]) {
    await this.coreApiService.login();

    const result = await this.api.draftRevision('admin', 'test', 'master');

    if (result.error) {
      throw new Error(String(result.error));
    }

    const revisionId = result.data.id;

    const migrationsResult = await this.api.migrations(revisionId);

    if (migrationsResult.error) {
      throw new Error(String(migrationsResult.error));
    }

    const remoteMigrations = migrationsResult.data || [];
    const sortedLocalMigrations = this.sortMigrationsByDate(jsonData);

    console.log(
      `📊 Found ${remoteMigrations.length} remote migrations and ${sortedLocalMigrations.length} local migrations`,
    );

    const migrationsToApply = this.determineMigrationsToApply(
      sortedLocalMigrations,
      remoteMigrations,
    );

    if (migrationsToApply.length === 0) {
      console.log('✅ No migrations to apply - all migrations are up to date');
      return;
    }

    console.log(`🚀 Applying ${migrationsToApply.length} migrations...`);

    const appliedMigrations: string[] = [];

    try {
      for (const localMigration of migrationsToApply) {
        console.log(
          `🔄 Processing migration for table ${localMigration.tableId} (hash: ${localMigration.hash})`,
        );

        const table = await this.api.table(revisionId, localMigration.tableId);

        if (!table.data) {
          await this.createTableFromMigration(revisionId, localMigration);
        } else {
          await this.updateTableFromMigration(revisionId, localMigration);
        }

        appliedMigrations.push(
          `${localMigration.tableId}:${localMigration.hash}`,
        );
      }

      console.log('✅ All migrations processed successfully');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      console.error(
        `🔄 Successfully applied ${appliedMigrations.length} migrations before failure:`,
      );
      appliedMigrations.forEach((migration) => {
        console.error(`   - ${migration}`);
      });
      throw error;
    }
  }

  private determineMigrationsToApply(
    localMigrations: Migration[],
    remoteMigrations: MigrationsModel[],
  ): Migration[] {
    const migrationsToApply: Migration[] = [];

    for (const localMigration of localMigrations) {
      const remoteMigration = remoteMigrations.find(
        (rm: MigrationsModel) =>
          rm.tableId === localMigration.tableId &&
          rm.hash === localMigration.hash,
      );

      if (remoteMigration) {
        console.log(
          `⏭️  Skipping migration for table ${localMigration.tableId} (hash: ${localMigration.hash}) - already applied`,
        );
        continue;
      }

      migrationsToApply.push(localMigration);
    }

    return migrationsToApply;
  }

  private sortMigrationsByDate(migrations: Migration[]): Migration[] {
    return [...migrations].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }

  private async createTableFromMigration(
    revisionId: string,
    migration: Migration,
  ) {
    const addPatch = migration.patches.find((patch) => patch.op === 'add');

    if (!addPatch) {
      throw new Error(
        `Migration for table ${migration.tableId} has no 'add' patch for table creation`,
      );
    }

    if (migration.patches.length > 1) {
      console.warn(
        `⚠️  Warning: Migration for new table ${migration.tableId} has ${migration.patches.length} patches. Only the 'add' patch will be used for table creation.`,
      );
    }

    console.log(`🆕 Creating table ${migration.tableId}`);

    try {
      const createResult = await this.api.createTable(revisionId, {
        tableId: migration.tableId,
        schema: addPatch.value,
      });

      if (createResult.error) {
        throw new Error(
          `API error while creating table ${migration.tableId}: ${createResult.error}`,
        );
      }

      console.log(`✅ Table ${migration.tableId} created successfully`);
    } catch (error) {
      throw new Error(
        `Failed to create table ${migration.tableId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async updateTableFromMigration(
    revisionId: string,
    migration: Migration,
  ) {
    if (migration.patches.length === 0) {
      console.warn(
        `⚠️  Warning: No patches found for table ${migration.tableId}, skipping update`,
      );
      return;
    }

    console.log(
      `🔧 Updating table ${migration.tableId} with ${migration.patches.length} patches`,
    );

    // Validate patches have required operations
    const validOps = ['add', 'remove', 'replace', 'move'];
    const invalidPatches = migration.patches.filter(
      (patch) => !validOps.includes(patch.op),
    );

    if (invalidPatches.length > 0) {
      throw new Error(
        `Invalid patch operations found for table ${migration.tableId}: ${invalidPatches.map((p) => p.op).join(', ')}`,
      );
    }

    try {
      const updateResult = await this.api.updateTable(
        revisionId,
        migration.tableId,
        {
          patches: migration.patches,
        },
      );

      if (updateResult.error) {
        throw new Error(
          `API error while updating table ${migration.tableId}: ${updateResult.error}`,
        );
      }

      console.log(`✅ Table ${migration.tableId} updated successfully`);
    } catch (error) {
      throw new Error(
        `Failed to update table ${migration.tableId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Option({
    flags: '-f, --file <file>',
    description:
      'JSON file to validate with schema: { date: string, hash: string, patches: object[] }[]',
    required: true,
  })
  parseFile(val: string) {
    return val;
  }

  private get api() {
    return this.coreApiService.api;
  }
}
