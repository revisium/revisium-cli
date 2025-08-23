import { Option, SubCommand } from 'nest-commander';
import { readFile } from 'fs/promises';
import { BaseCommand } from 'src/commands/base.command';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';
import { JsonValidatorService } from 'src/services/json-validator.service';
import { CommitRevisionService } from 'src/services/commit-revision.service';
import { Migration } from 'src/types/migration.types';

type Options = {
  file: string;
  commit?: boolean;
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
    private readonly commitRevisionService: CommitRevisionService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.file) {
      throw new Error('Error: --file option is required');
    }

    console.log('🔐 Authenticating with Revisium API...');
    await this.coreApiService.tryToLogin(options);
    console.log('✅ Authentication successful');

    console.log(`📋 Validating migration file: ${options.file}`);
    const jsonData = await this.validateJsonFile(options.file);
    console.log('✅ Migration file validation passed');

    const countAppliedMigrations = await this.applyMigration(options, jsonData);

    await this.commitRevisionService.handleCommitFlow(
      options,
      'Applied',
      countAppliedMigrations || 0,
    );
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
      throw error;
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

    let countAppliedMigrations = 0;

    try {
      for (const localMigration of migrations) {
        const result = await this.api.applyMigrations(revisionId, [
          localMigration,
        ]);

        const response = result.data[0];

        if (response.status === 'failed') {
          console.error('❌ Migration failed:', response);
          throw new Error(
            `Migration ${response.id} failed: ${response.error || 'Unknown error'}`,
          );
        } else if (response.status === 'skipped') {
          console.log(`⏭️  Migration already applied: ${response.id}`);
        } else if (response.status === 'applied') {
          console.log(`✅ Migration applied: ${response.id}`);
          countAppliedMigrations++;
        }
      }

      if (countAppliedMigrations > 0) {
        console.log(
          `✅ Successfully applied ${countAppliedMigrations} migrations`,
        );
      } else {
        console.log('✅ All migrations processed (no new migrations applied)');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`❌ Migration process failed: ${errorMessage}`);
      throw error;
    }

    return countAppliedMigrations;
  }

  private get api() {
    return this.coreApiService.api;
  }

  @Option({
    flags: '-f, --file [string]',
    description: 'JSON file containing migrations to apply',
    required: true,
  })
  parseFile(value: string) {
    return value;
  }

  @Option({
    flags: '-c, --commit [boolean]',
    description: 'Create a revision after applying migrations',
    defaultValue: false,
  })
  parseCommit(value?: string): boolean {
    return JSON.parse(value ?? 'false') as boolean;
  }
}
