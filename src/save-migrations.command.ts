import { writeFile } from 'fs/promises';
import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { CoreApiService } from 'src/core-api.service';

@SubCommand({
  name: 'save',
  description: 'Save migrations to file',
})
export class SaveMigrationsCommand extends CommandRunner {
  constructor(private readonly coreApiService: CoreApiService) {
    super();
  }

  async run(_inputs: string[], options: Record<string, string>): Promise<void> {
    if (!options.file) {
      console.error('Error: --file option is required');
      process.exit(1);
    }

    const revisionId = await this.getRevisionId();
    await this.saveFile(revisionId, options.file);
  }

  private async saveFile(revisionId: string, filePath: string) {
    try {
      const result = await this.api.migrations(revisionId);

      await writeFile(filePath, JSON.stringify(result.data, null, 2), 'utf-8');

      console.log(`✅ Save migrations to: ${filePath}`);
    } catch (error) {
      console.error(
        'Error reading or parsing file:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }

  private async getRevisionId() {
    await this.coreApiService.login();

    const result = await this.api.draftRevision('admin', 'test', 'master');

    if (result.error) {
      throw new Error(String(result.error));
    }

    return result.data.id;
  }

  @Option({
    flags: '-f, --file <file>',
    description: 'file to save migrations',
    required: true,
  })
  parseFile(val: string) {
    return val;
  }

  private get api() {
    return this.coreApiService.api;
  }
}
