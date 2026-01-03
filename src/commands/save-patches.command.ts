import { Option, SubCommand } from 'nest-commander';
import { BaseCommand, BaseOptions } from './base.command';
import { PatchGeneratorService } from '../services/patch-generator.service';
import { PatchLoaderService } from '../services/patch-loader.service';
import { ConnectionService } from '../services/connection.service';
import { PatchFile } from '../types/patch.types';

type Options = BaseOptions & {
  table: string;
  paths: string;
  output: string;
  merge?: boolean;
};

@SubCommand({
  name: 'save',
  description: 'Save current field values from API as patch files',
})
export class SavePatchesCommand extends BaseCommand {
  constructor(
    private readonly generatorService: PatchGeneratorService,
    private readonly loaderService: PatchLoaderService,
    private readonly connectionService: ConnectionService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.table) {
      throw new Error('Error: --table option is required');
    }

    if (!options.output) {
      throw new Error('Error: --output option is required');
    }

    if (!options.paths) {
      throw new Error('Error: --paths option is required');
    }

    await this.connectionService.connect(options);
    const revisionId = this.connectionService.revisionId;

    const paths = options.paths.split(',').map((p) => p.trim());
    console.log(`📋 Using paths: ${paths.join(', ')}`);

    console.log(`📋 Loading rows from table '${options.table}'...`);
    const rows = await this.loadAllRows(revisionId, options.table);
    console.log(`✅ Loaded ${rows.length} row(s)\n`);

    console.log('💾 Generating patches...');
    const patchFiles: PatchFile[] = [];

    for (const row of rows) {
      const rowData = (row as { id: string; data: unknown }).data;
      const rowId = (row as { id: string }).id;

      const patches = this.generatorService.generatePatches(rowData, paths);

      if (patches.length > 0) {
        patchFiles.push({
          version: '1.0',
          table: options.table,
          rowId,
          createdAt: new Date().toISOString(),
          patches,
        });
      }
    }

    console.log(`✅ Generated patches for ${patchFiles.length} row(s)\n`);

    if (patchFiles.length === 0) {
      console.log('⚠️  No patches generated (all paths were empty)');
      return;
    }

    console.log(`💾 Saving patches to ${options.output}...`);
    if (options.merge) {
      await this.loaderService.savePatchesAsMergedFile(
        patchFiles,
        options.output,
      );
    } else {
      await this.loaderService.savePatchesAsSeparateFiles(
        patchFiles,
        options.output,
      );
    }
    console.log(`✅ Saved successfully`);
  }

  private async loadAllRows(
    revisionId: string,
    tableId: string,
  ): Promise<unknown[]> {
    const allRows: unknown[] = [];
    let hasMore = true;
    let after: string | undefined;

    while (hasMore) {
      const result = await this.api.rows(revisionId, tableId, {
        first: 100,
        after,
      });

      const { edges, pageInfo } = result.data;

      for (const edge of edges) {
        allRows.push(edge.node);
      }

      hasMore = pageInfo.hasNextPage;
      after = pageInfo.endCursor;
    }

    return allRows;
  }

  private get api() {
    return this.connectionService.api;
  }

  @Option({
    flags: '--table <name>',
    description: 'Table name',
    required: true,
  })
  parseTable(value: string): string {
    return value;
  }

  @Option({
    flags: '--paths <paths>',
    description: 'Comma-separated field paths (e.g., "title,status")',
    required: true,
  })
  parsePaths(value: string): string {
    return value;
  }

  @Option({
    flags: '--output <path>',
    description: 'Output folder (for separate files) or file path (for merged)',
    required: true,
  })
  parseOutput(value: string): string {
    return value;
  }

  @Option({
    flags: '--merge',
    description: 'Merge all patches into a single file',
  })
  parseMerge(): boolean {
    return true;
  }
}
