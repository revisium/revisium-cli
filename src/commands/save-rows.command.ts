import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Option, SubCommand } from 'nest-commander';
import { BaseCommand, BaseOptions } from 'src/commands/base.command';
import { ConnectionService } from 'src/services/connection.service';
import { LoggerService } from 'src/services/logger.service';
import {
  fetchAllPages,
  fetchAndProcessPages,
} from 'src/utils/paginated-fetcher';

type Options = BaseOptions & {
  folder: string;
  tables?: string;
};

@SubCommand({
  name: 'save',
  description: 'Save all rows from tables to JSON files',
})
export class SaveRowsCommand extends BaseCommand {
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
    await this.saveAllTableRows(
      this.connectionService.revisionId,
      options.folder,
      options.tables,
    );
  }

  private async saveAllTableRows(
    revisionId: string,
    folderPath: string,
    tableFilter?: string,
  ) {
    try {
      await mkdir(folderPath, { recursive: true });

      const tablesToProcess = await this.getTargetTables(
        revisionId,
        tableFilter,
      );

      this.logger.foundItems(tablesToProcess.length, 'tables to process');

      for (const tableId of tablesToProcess) {
        await this.saveRowsFromTable(revisionId, tableId, folderPath);
      }

      this.logger.summary(
        `Successfully processed ${tablesToProcess.length} tables in: ${folderPath}`,
      );
    } catch (error) {
      this.logger.error(
        `Error saving table rows: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async getTargetTables(
    revisionId: string,
    tableFilter?: string,
  ): Promise<string[]> {
    if (tableFilter) {
      return tableFilter.split(',').map((id) => id.trim());
    }

    const { items } = await fetchAllPages((params) =>
      this.api.tables({ revisionId, ...params }),
    );

    return items.map((table) => table.id);
  }

  private async saveRowsFromTable(
    revisionId: string,
    tableId: string,
    folderPath: string,
  ) {
    try {
      this.logger.processingTable(tableId);

      const tableFolderPath = join(folderPath, tableId);
      await mkdir(tableFolderPath, { recursive: true });

      const { processed, total } = await fetchAndProcessPages(
        (params) => this.api.rows(revisionId, tableId, params),
        async (row) => {
          const filePath = join(tableFolderPath, `${row.id}.json`);
          await writeFile(filePath, JSON.stringify(row, null, 2), 'utf-8');
        },
        {
          onFirstPage: (totalCount) =>
            this.logger.indent(
              `📊 Found ${totalCount} rows in table ${tableId}`,
            ),
        },
      );

      this.logger.success(
        `Saved ${processed}/${total} rows from table: ${tableId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process table ${tableId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private get api() {
    return this.connectionService.api;
  }

  @Option({
    flags: '-f, --folder [string]',
    description: 'Folder path to save row files',
    required: true,
  })
  parseFolder(val: string) {
    return val;
  }

  @Option({
    flags: '-t, --tables [string]',
    description:
      'Comma-separated table IDs (e.g., table1,table2). If not specified, processes all tables.',
    required: false,
  })
  parseTables(value: string) {
    return value;
  }
}
