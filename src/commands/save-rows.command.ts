import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';

type Options = {
  folder: string;
  tables?: string;
  organization?: string;
  project?: string;
  branch?: string;
};

@SubCommand({
  name: 'save',
  description: 'Save all rows from tables to JSON files',
})
export class SaveRowsCommand extends CommandRunner {
  constructor(
    private readonly coreApiService: CoreApiService,
    private readonly draftRevisionService: DraftRevisionService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    try {
      if (!options.folder) {
        console.error('Error: --folder option is required');
        process.exit(1);
      }

      await this.coreApiService.tryToLogin();
      const revisionId =
        await this.draftRevisionService.getDraftRevisionId(options);
      await this.saveAllTableRows(revisionId, options.folder, options.tables);
    } catch (error) {
      console.error(error);
    }
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

      console.log(`📊 Found ${tablesToProcess.length} tables to process`);

      for (const tableId of tablesToProcess) {
        await this.saveRowsFromTable(revisionId, tableId, folderPath);
      }

      console.log(
        `🎉 Successfully processed ${tablesToProcess.length} tables in: ${folderPath}`,
      );
    } catch (error) {
      console.error(
        'Error saving table rows:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }

  private async getTargetTables(
    revisionId: string,
    tableFilter?: string,
  ): Promise<string[]> {
    if (tableFilter) {
      // Parse comma-separated table IDs
      return tableFilter.split(',').map((id) => id.trim());
    }

    // Fetch all tables if no filter specified
    const allTables: string[] = [];
    let hasMore = true;
    let after: string | undefined;

    while (hasMore) {
      const result = await this.api.tables({
        revisionId,
        first: 100,
        after,
      });

      const { edges, pageInfo } = result.data;

      for (const edge of edges) {
        allTables.push(edge.node.id);
      }

      hasMore = pageInfo.hasNextPage;
      after = pageInfo.endCursor;
    }

    return allTables;
  }

  private async saveRowsFromTable(
    revisionId: string,
    tableId: string,
    folderPath: string,
  ) {
    try {
      console.log(`📋 Processing table: ${tableId}`);

      let hasMore = true;
      let after: string | undefined;
      let totalRows = 0;
      let processedRows = 0;
      let isFirstPage = true;

      const tableFolderPath = join(folderPath, tableId);
      await mkdir(tableFolderPath, { recursive: true });

      while (hasMore) {
        const result = await this.api.rows(revisionId, tableId, {
          first: 100,
          after,
        });

        const { edges, pageInfo } = result.data;

        if (isFirstPage) {
          totalRows = result.data.totalCount;
          console.log(`  📊 Found ${totalRows} rows in table ${tableId}`);
          isFirstPage = false;
        }

        for (const edge of edges) {
          const row = edge.node;
          try {
            const fileName = `${row.id}.json`;
            const filePath = join(tableFolderPath, fileName);

            await writeFile(filePath, JSON.stringify(row, null, 2), 'utf-8');

            processedRows++;
          } catch (error) {
            console.error(
              `❌ Failed to save row ${row.id} from table ${tableId}:`,
              error,
            );
          }
        }

        hasMore = pageInfo.hasNextPage;
        after = pageInfo.endCursor;
      }

      console.log(
        `✅ Saved ${processedRows}/${totalRows} rows from table: ${tableId}`,
      );
    } catch (error) {
      console.error(
        `❌ Failed to process table ${tableId}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private get api() {
    return this.coreApiService.api;
  }

  @Option({
    flags: '-f, --folder <folder>',
    description: 'Folder path to save row files',
    required: true,
  })
  parseFolder(val: string) {
    return val;
  }

  @Option({
    flags: '-t, --tables <tables>',
    description:
      'Comma-separated table IDs (e.g., table1,table2). If not specified, processes all tables.',
    required: false,
  })
  parseTables(val: string) {
    return val;
  }

  @Option({
    flags: '-o, --organization <organization>',
    description: 'organization name',
    required: false,
  })
  parseOrganization(val: string) {
    return val;
  }

  @Option({
    flags: '-p, --project <project>',
    description: 'project name',
    required: false,
  })
  parseProject(val: string) {
    return val;
  }

  @Option({
    flags: '-b, --branch <branch>',
    description: 'branch name',
    required: false,
  })
  parseBranch(val: string) {
    return val;
  }
}
