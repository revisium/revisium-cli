import { writeFile } from 'node:fs/promises';
import { Option, SubCommand } from 'nest-commander';
import { BaseCommand, BaseOptions } from 'src/commands/base.command';
import { ConnectionService } from 'src/services/connection.service';

type Options = BaseOptions & {
  file: string;
};

@SubCommand({
  name: 'save',
  description: 'Save migrations to file',
})
export class SaveMigrationsCommand extends BaseCommand {
  constructor(private readonly connectionService: ConnectionService) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.file) {
      throw new Error('Error: --file option is required');
    }

    await this.connectionService.connect(options);
    await this.saveFile(this.connectionService.revisionId, options.file);
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
    flags: '-f, --file [string]',
    description: 'file to save migrations',
    required: true,
  })
  parseFile(value: string) {
    return value;
  }

  private get api() {
    return this.connectionService.api;
  }
}
