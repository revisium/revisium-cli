import { Command, CommandRunner, Option } from 'nest-commander';
import { readFile } from 'fs/promises';
import Ajv from 'ajv';
import { migrationSchema } from 'src/config/migration.schema';
import { CoreApiService } from 'src/core-api.service';
import { Migration } from 'src/types/migration.types';

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
      throw new Error(result.error);
    }

    const revisionId = result.data.id;

    const migrationsResult = await this.api.migrations(revisionId);

    if (migrationsResult.error) {
      throw new Error(migrationsResult.error);
    }

    for (const item of jsonData) {
      const table = await this.api.table(revisionId, item.tableId);

      if (!table.data) {
        const patch = item.patches[0];

        if (patch.op !== 'add') {
          throw new Error('Patch error, expected add patch');
        }

        await this.api.createTable(revisionId, {
          tableId: item.tableId,
          schema: patch.value,
        });
      }
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
