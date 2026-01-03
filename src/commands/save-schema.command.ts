import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Option, SubCommand } from 'nest-commander';
import { BaseCommand, BaseOptions } from 'src/commands/base.command';
import { ConnectionService } from 'src/services/connection.service';
import { fetchAndProcessPages } from 'src/utils/paginated-fetcher';

type Options = BaseOptions & {
  folder: string;
};

@SubCommand({
  name: 'save',
  description: 'Save all table schemas to JSON files',
})
export class SaveSchemaCommand extends BaseCommand {
  constructor(private readonly connectionService: ConnectionService) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.folder) {
      throw new Error('Error: --folder option is required');
    }

    await this.connectionService.connect(options);
    await this.saveAllTableSchemas(
      this.connectionService.revisionId,
      options.folder,
    );
  }

  private async saveAllTableSchemas(revisionId: string, folderPath: string) {
    try {
      await mkdir(folderPath, { recursive: true });

      console.log('🔍 Fetching tables...');

      let totalTables = 0;

      const { processed } = await fetchAndProcessPages(
        (params) => this.api.tables({ revisionId, ...params }),
        async (table, index) => {
          console.log(`📋 Processing table: ${table.id}`);

          const schemaResult = await this.api.tableSchema(revisionId, table.id);
          const fileName = `${table.id}.json`;
          const filePath = join(folderPath, fileName);

          await writeFile(
            filePath,
            JSON.stringify(schemaResult.data, null, 2),
            'utf-8',
          );

          console.log(
            `✅ Saved schema: ${fileName} (${index + 1}/${totalTables})`,
          );
        },
        {
          onFirstPage: (count) => {
            totalTables = count;
            console.log(`📊 Found ${count} tables to process`);
          },
        },
      );

      console.log(
        `🎉 Successfully saved ${processed}/${totalTables} table schemas to: ${folderPath}`,
      );
    } catch (error) {
      console.error(
        'Error saving table schemas:',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private get api() {
    return this.connectionService.api;
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
