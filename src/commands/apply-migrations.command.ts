import { readFile } from 'node:fs/promises';
import { Option, SubCommand } from 'nest-commander';
import { BaseCommand, BaseOptions } from 'src/commands/base.command';
import { ConnectionService } from 'src/services/connection.service';
import { JsonValidatorService } from 'src/services/json-validator.service';
import { CommitRevisionService } from 'src/services/commit-revision.service';
import { Migration } from 'src/types/migration.types';
import { parseBooleanOption } from 'src/utils/parse-boolean.utils';

type Options = BaseOptions & {
  file: string;
  commit?: boolean;
};

@SubCommand({
  name: 'apply',
  description: 'Validate and process migration files',
})
export class ApplyMigrationsCommand extends BaseCommand {
  constructor(
    private readonly connectionService: ConnectionService,
    private readonly jsonValidatorService: JsonValidatorService,
    private readonly commitRevisionService: CommitRevisionService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.file) {
      throw new Error('Error: --file option is required');
    }

    console.log(`📋 Validating migration file: ${options.file}`);
    const jsonData = await this.validateJsonFile(options.file);
    console.log('✅ Migration file validation passed');

    await this.connectionService.connect(options);

    const countAppliedMigrations = await this.applyMigration(jsonData);

    await this.commitRevisionService.handleCommitFlow(
      options.commit,
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

  private async applyMigration(migrations: Migration[]) {
    const revisionId = this.connectionService.draftRevisionId;

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
    return this.connectionService.api;
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
  })
  parseCommit(value?: string): boolean {
    return parseBooleanOption(value);
  }
}
