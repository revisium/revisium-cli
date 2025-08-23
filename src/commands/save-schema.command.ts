import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';

type Options = {
  folder: string;
  organization?: string;
  project?: string;
  branch?: string;
};

@SubCommand({
  name: 'save',
  description: 'Save all table schemas to JSON files',
})
export class SaveSchemaCommand extends CommandRunner {
  constructor(
    private readonly coreApiService: CoreApiService,
    private readonly draftRevisionService: DraftRevisionService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.folder) {
      throw new Error('Error: --folder option is required');
    }

    await this.coreApiService.tryToLogin(options);
    const revisionId =
      await this.draftRevisionService.getDraftRevisionId(options);
    await this.saveAllTableSchemas(revisionId, options.folder);
  }

  private async saveAllTableSchemas(revisionId: string, folderPath: string) {
    try {
      await mkdir(folderPath, { recursive: true });

      let hasMore = true;
      let after: string | undefined;
      let totalTables = 0;
      let processedTables = 0;

      console.log('🔍 Fetching tables...');

      while (hasMore) {
        const result = await this.api.tables({
          revisionId,
          first: 100,
          after,
        });

        const { edges, pageInfo } = result.data;

        if (totalTables === 0) {
          totalTables = result.data.totalCount;
          console.log(`📊 Found ${totalTables} tables to process`);
        }

        for (const edge of edges) {
          const table = edge.node;
          try {
            console.log(`📋 Processing table: ${table.id}`);

            const schemaResult = await this.api.tableSchema(
              revisionId,
              table.id,
            );
            const fileName = `${table.id}.json`;
            const filePath = join(folderPath, fileName);

            await writeFile(
              filePath,
              JSON.stringify(schemaResult.data, null, 2),
              'utf-8',
            );

            processedTables++;
            console.log(
              `✅ Saved schema: ${fileName} (${processedTables}/${totalTables})`,
            );
          } catch (error) {
            console.error(
              `❌ Failed to save schema for table ${table.id}:`,
              error,
            );
          }
        }

        hasMore = pageInfo.hasNextPage;
        after = pageInfo.endCursor;
      }

      console.log(
        `🎉 Successfully saved ${processedTables}/${totalTables} table schemas to: ${folderPath}`,
      );
    } catch (error) {
      console.error(
        'Error saving table schemas:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }

  private get api() {
    return this.coreApiService.api;
  }

  @Option({
    flags: '-f, --folder <folder>',
    description: 'Folder path to save schema files',
    required: true,
  })
  parseFolder(val: string) {
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
