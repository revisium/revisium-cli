import { Command, CommandRunner, Option } from 'nest-commander';
import { readFile } from 'fs/promises';
import Ajv from 'ajv';
import { jsonPatchSchema } from 'src/config/json-patch-schema';
import { metaSchema } from 'src/config/meta-schema';
import { migrationSchema } from 'src/config/migration.schema';
import { tableMigrationsSchema } from 'src/config/table-migrations-schema';
import { CoreApiService } from 'src/core-api.service';
import { Migration } from 'src/types/migration.types';

@Command({
  name: 'migrate',
  description: 'Validate and process migration files',
})
export class TaskRunner extends CommandRunner {
  private readonly ajv = new Ajv();

  constructor(private readonly coreApiService: CoreApiService) {
    super();

    this.ajv.compile(metaSchema);
    this.ajv.compile(jsonPatchSchema);
    this.ajv.compile(tableMigrationsSchema);
  }

  async run(_inputs: string[], options: Record<string, string>): Promise<void> {
    if (!options.file) {
      console.error('Error: --file option is required');
      process.exit(1);
    }

    const jsonData = await this.validateJsonFile(options.file);
    await this.applyMigration(jsonData);
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

  private async applyMigration(migrations: Migration[]) {
    await this.coreApiService.login();

    const result = await this.api.draftRevision('admin', 'test', 'master');

    if (result.error) {
      throw new Error(String(result.error));
    }

    const revisionId = result.data.id;

    if (migrations.length === 0) {
      console.log('✅ No migrations to apply - all migrations are up to date');
      return;
    }

    console.log(`🚀 Applying ${migrations.length} migrations...`);

    try {
      for (const localMigration of migrations) {
        console.log(
          `🔄 Processing migration for table ${localMigration.tableId}`,
        );

        const result = await this.api.applyMigrations(revisionId, [
          localMigration,
        ]);

        const response = result.data[0];

        if (response.status === 'failed') {
          console.error('❌ Migration failed:', response);
          break;
        } else if (response.status === 'skipped') {
          console.error('Migration already applied:', response.id);
        } else if (response.status === 'applied') {
          console.error('Migration applied:', response.id);
        }
      }

      console.log('✅ All migrations processed successfully');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
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
