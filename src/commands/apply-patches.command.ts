import { Option, SubCommand } from 'nest-commander';
import { PatchRow } from 'src/__generated__/api';
import { BasePatchCommand, PatchOptions } from './base-patch.command';
import { PatchLoaderService } from '../services/patch-loader.service';
import { PatchValidationService } from '../services/patch-validation.service';
import { PatchDiffService } from '../services/patch-diff.service';
import { CoreApiService } from '../services/core-api.service';
import { DraftRevisionService } from '../services/draft-revision.service';
import { CommitRevisionService } from '../services/commit-revision.service';
import { PatchFile, DiffResult } from '../types/patch.types';

type Options = PatchOptions & {
  commit?: boolean;
};

interface ApplyStats {
  totalPatches: number;
  totalRows: number;
  applied: number;
  skipped: number;
  validationErrors: number;
  applyErrors: number;
}

@SubCommand({
  name: 'apply',
  description: 'Apply patches to rows in API',
})
export class ApplyPatchesCommand extends BasePatchCommand {
  constructor(
    loaderService: PatchLoaderService,
    validationService: PatchValidationService,
    diffService: PatchDiffService,
    coreApiService: CoreApiService,
    draftRevisionService: DraftRevisionService,
    private readonly commitRevisionService: CommitRevisionService,
  ) {
    super(
      loaderService,
      validationService,
      diffService,
      coreApiService,
      draftRevisionService,
    );
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    const result = await this.loadAndValidatePatches(options);

    if (!result) {
      return;
    }

    const { patches, revisionId, diff } = result;

    console.log('📝 Applying patches...');
    const stats = await this.applyAllPatches(patches, diff, revisionId);

    this.printStats(stats);

    if (stats.validationErrors > 0 || stats.applyErrors > 0) {
      console.error('\n❌ Some patches failed to apply');
      process.exit(1);
    }

    console.log('\n✅ All patches applied successfully');

    const totalChanges = stats.applied;
    await this.commitRevisionService.handleCommitFlow(
      options,
      'Applied patches',
      totalChanges,
    );
  }

  private async applyAllPatches(
    patchFiles: PatchFile[],
    diff: DiffResult,
    revisionId: string,
  ): Promise<ApplyStats> {
    const stats: ApplyStats = {
      totalPatches: 0,
      totalRows: patchFiles.length,
      applied: 0,
      skipped: 0,
      validationErrors: 0,
      applyErrors: 0,
    };

    const rowsWithChanges = new Map<string, boolean>();
    for (const row of diff.rows) {
      const hasChanges = row.patches.some((p) => p.status === 'CHANGE');
      if (hasChanges) {
        const compositeKey = `${diff.table}:${row.rowId}`;
        rowsWithChanges.set(compositeKey, true);
      }
    }

    const patchesByTable = new Map<string, PatchFile[]>();
    for (const patchFile of patchFiles) {
      if (!patchesByTable.has(patchFile.table)) {
        patchesByTable.set(patchFile.table, []);
      }
      patchesByTable.get(patchFile.table)?.push(patchFile);
      stats.totalPatches += patchFile.patches.length;
    }

    for (const [table, tablePatchFiles] of patchesByTable) {
      console.log(`\n📋 Applying patches to table: ${table}`);

      for (const patchFile of tablePatchFiles) {
        const compositeKey = `${table}:${patchFile.rowId}`;
        if (!rowsWithChanges.has(compositeKey)) {
          stats.skipped++;
          continue;
        }

        const result = await this.applyPatchFile(patchFile, revisionId, table);

        switch (result) {
          case 'applied':
            stats.applied++;
            console.log(`  ✅ Applied: ${patchFile.rowId}`);
            break;
          case 'skipped':
            stats.skipped++;
            console.log(`  ⏭️  Skipped (empty): ${patchFile.rowId}`);
            break;
          case 'validationError':
            stats.validationErrors++;
            console.error(`  ❌ Validation error: ${patchFile.rowId}`);
            break;
          case 'applyError':
            stats.applyErrors++;
            console.error(`  ❌ Apply error: ${patchFile.rowId}`);
            break;
        }
      }
    }

    return stats;
  }

  private async applyPatchFile(
    patchFile: PatchFile,
    revisionId: string,
    table: string,
  ): Promise<'applied' | 'skipped' | 'validationError' | 'applyError'> {
    if (patchFile.patches.length === 0) {
      return 'skipped';
    }

    try {
      const result = await this.api.patchRow(
        revisionId,
        table,
        patchFile.rowId,
        {
          patches: patchFile.patches as PatchRow[],
        },
      );

      if (result.error) {
        console.error(
          `    Error details: ${JSON.stringify(result.error, null, 2)}`,
        );
        return 'applyError';
      }

      if (!result.data) {
        console.error('    Error: No data returned from API');
        return 'applyError';
      }

      return 'applied';
    } catch (error) {
      console.error(
        `    Exception: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'applyError';
    }
  }

  private printStats(stats: ApplyStats): void {
    console.log('\n📊 Apply Summary:');
    console.log(`  Total rows: ${stats.totalRows}`);
    console.log(`  Total patches: ${stats.totalPatches}`);
    console.log(`  ✅ Applied: ${stats.applied}`);
    console.log(`  ⏭️  Skipped: ${stats.skipped}`);
    console.log(`  ❌ Validation errors: ${stats.validationErrors}`);
    console.log(`  ❌ Apply errors: ${stats.applyErrors}`);

    const successRate =
      stats.totalRows > 0
        ? ((stats.applied / stats.totalRows) * 100).toFixed(1)
        : '0';
    const totalErrors = stats.validationErrors + stats.applyErrors;
    console.log(`  Success rate: ${successRate}% (${totalErrors} errors)`);
  }

  private get api() {
    return this.coreApiService.api;
  }

  @Option({
    flags: '--input <path>',
    description: 'Input folder or file with patch files',
    required: true,
  })
  parseInput(value: string): string {
    return value;
  }

  @Option({
    flags: '-c, --commit [boolean]',
    description: 'Create a revision after applying patches',
  })
  parseCommit(value?: string): boolean {
    return JSON.parse(value ?? 'true') as boolean;
  }
}
