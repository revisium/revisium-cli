import { Option, SubCommand } from 'nest-commander';
import { readFile } from 'fs/promises';
import { BaseCommand } from 'src/commands/base.command';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';
import { JsonValidatorService } from 'src/services/json-validator.service';
import { Migration } from 'src/types/migration.types';

type Options = {
  file: string;
  organization?: string;
  project?: string;
  branch?: string;
};

@SubCommand({
  name: 'apply',
  description: 'Validate and process migration files',
})
export class ApplyMigrationsCommand extends BaseCommand {
  constructor(
    private readonly coreApiService: CoreApiService,
    private readonly jsonValidatorService: JsonValidatorService,
    private readonly draftRevisionService: DraftRevisionService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.file) {
      throw new Error('Error: --file option is required');
    }

    await this.coreApiService.tryToLogin(options);
    const jsonData = await this.validateJsonFile(options.file);
    await this.applyMigration(options, jsonData);
  }

  private async validateJsonFile(filePath: string) {
    try {
      const fileContent = await readFile(filePath, 'utf-8');
      const data: unknown = JSON.parse(fileContent);

      return this.jsonValidatorService.validateMigration(data);
    } catch (error) {
      console.error(
        'Error reading or parsing file:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }

  private async applyMigration(options: Options, migrations: Migration[]) {
    const revisionId =
      await this.draftRevisionService.getDraftRevisionId(options);

    if (migrations.length === 0) {
      console.log('✅ No migrations to apply - all migrations are up to date');
      return;
    }

    console.log(`🚀 Applying ${migrations.length} migrations...`);

    try {
      for (const localMigration of migrations) {
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

  private get api() {
    return this.coreApiService.api;
  }

  @Option({
    flags: '-f, --file <file>',
    description: 'JSON file to validate',
    required: true,
  })
  parseFile(value: string) {
    return value;
  }
}
