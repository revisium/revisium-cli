import { writeFile } from 'fs/promises';
import { Option, SubCommand } from 'nest-commander';
import { BaseCommand, BaseOptions } from 'src/commands/base.command';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';

type Options = {
  file: string;
} & BaseOptions;

@SubCommand({
  name: 'save',
  description: 'Save migrations to file',
})
export class SaveMigrationsCommand extends BaseCommand {
  constructor(
    private readonly coreApiService: CoreApiService,
    private readonly draftRevisionService: DraftRevisionService,
  ) {
    super();
  }

  async run(_inputs: string[], options?: Options): Promise<void> {
    if (!options?.file) {
      throw new Error('Error: --file option is required');
    }

    await this.coreApiService.tryToLogin();
    const revisionId =
      await this.draftRevisionService.getDraftRevisionId(options);
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
      throw error;
    }
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
