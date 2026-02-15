import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Option, SubCommand } from 'nest-commander';
import { RevisionScope } from '@revisium/client';
import { BaseCommand, BaseOptions } from 'src/commands/base.command';
import { ConnectionService } from 'src/services/connection';
import { LoggerService } from 'src/services/common';
import { fetchAndProcessPages } from 'src/utils/paginated-fetcher';

type Options = BaseOptions & {
  folder: string;
};

@SubCommand({
  name: 'save',
  description: 'Save all table schemas to JSON files',
})
export class SaveSchemaCommand extends BaseCommand {
  constructor(
    private readonly connectionService: ConnectionService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.folder) {
      throw new Error('Error: --folder option is required');
    }

    await this.connectionService.connect(options);
    await this.saveAllTableSchemas(options.folder);
  }

  private async saveAllTableSchemas(folderPath: string) {
    try {
      await mkdir(folderPath, { recursive: true });

      this.logger.info('🔍 Fetching tables...');

      let totalTables = 0;

      const { processed } = await fetchAndProcessPages(
        (params) =>
          this.revisionScope.getTables(params).then((data) => ({ data })),
        async (table, index) => {
          this.logger.processingTable(table.id);

          const schema = await this.revisionScope.getTableSchema(table.id);
          const fileName = `${table.id}.json`;
          const filePath = join(folderPath, fileName);

          await writeFile(filePath, JSON.stringify(schema, null, 2), 'utf-8');

          this.logger.success(
            `Saved schema: ${fileName} (${index + 1}/${totalTables})`,
          );
        },
        {
          onFirstPage: (count) => {
            totalTables = count;
            this.logger.foundItems(count, 'tables to process');
          },
        },
      );

      this.logger.summary(
        `Successfully saved ${processed}/${totalTables} table schemas to: ${folderPath}`,
      );
    } catch (error) {
      this.logger.error(
        `Error saving table schemas: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private get revisionScope(): RevisionScope {
    return this.connectionService.revisionScope;
  }

  @Option({
    flags: '-f, --folder [string]',
    description: 'Folder path to save schema files',
    required: true,
  })
  parseFolder(value: string) {
    return value;
  }
}
