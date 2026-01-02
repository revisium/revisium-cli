import { Option, SubCommand } from 'nest-commander';
import { PatchRow, PatchRowsRowDto } from 'src/__generated__/api';
import { BasePatchCommand, PatchOptions } from './base-patch.command';
import { PatchLoaderService } from '../services/patch-loader.service';
import { PatchValidationService } from '../services/patch-validation.service';
import { PatchDiffService } from '../services/patch-diff.service';
import { CoreApiService } from '../services/core-api.service';
import { DraftRevisionService } from '../services/draft-revision.service';
import { CommitRevisionService } from '../services/commit-revision.service';
import { PatchFile, DiffResult } from '../types/patch.types';
import { parseBooleanOption } from '../utils/parse-boolean.utils';

const DEFAULT_BATCH_SIZE = 100;

type Options = PatchOptions & {
  commit?: boolean;
  batchSize?: number;
};

interface ProgressState {
  tableId: string;
  current: number;
  total: number;
}

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

    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

    console.log('📝 Applying patches...');
    const stats = await this.applyAllPatches(
      patches,
      diff,
      revisionId,
      batchSize,
    );

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
    batchSize: number,
  ): Promise<ApplyStats> {
    const stats: ApplyStats = {
      totalPatches: 0,
      totalRows: patchFiles.length,
      applied: 0,
      skipped: 0,
      validationErrors: 0,
      applyErrors: 0,
    };

    const rowsWithChanges = this.buildRowsWithChangesMap(diff);
    const patchesByTable = this.groupPatchesByTable(patchFiles, stats);

    await this.processAllTables(
      patchesByTable,
      rowsWithChanges,
      stats,
      revisionId,
      batchSize,
    );

    return stats;
  }

  private buildRowsWithChangesMap(diff: DiffResult): Map<string, boolean> {
    const rowsWithChanges = new Map<string, boolean>();
    for (const row of diff.rows) {
      const hasChanges = row.patches.some((p) => p.status === 'CHANGE');
      if (hasChanges) {
        rowsWithChanges.set(`${diff.table}:${row.rowId}`, true);
      }
    }
    return rowsWithChanges;
  }

  private groupPatchesByTable(
    patchFiles: PatchFile[],
    stats: ApplyStats,
  ): Map<string, PatchFile[]> {
    const patchesByTable = new Map<string, PatchFile[]>();
    for (const patchFile of patchFiles) {
      if (!patchesByTable.has(patchFile.table)) {
        patchesByTable.set(patchFile.table, []);
      }
      patchesByTable.get(patchFile.table)?.push(patchFile);
      stats.totalPatches += patchFile.patches.length;
    }
    return patchesByTable;
  }

  private async processAllTables(
    patchesByTable: Map<string, PatchFile[]>,
    rowsWithChanges: Map<string, boolean>,
    stats: ApplyStats,
    revisionId: string,
    batchSize: number,
  ): Promise<void> {
    for (const [table, tablePatchFiles] of patchesByTable) {
      console.log(`\n📋 Applying patches to table: ${table}`);
      await this.processTablePatches(
        table,
        tablePatchFiles,
        rowsWithChanges,
        stats,
        revisionId,
        batchSize,
      );
    }
  }

  private async processTablePatches(
    table: string,
    tablePatchFiles: PatchFile[],
    rowsWithChanges: Map<string, boolean>,
    stats: ApplyStats,
    revisionId: string,
    batchSize: number,
  ): Promise<void> {
    const rowsToApply = this.filterApplicableRows(
      table,
      tablePatchFiles,
      rowsWithChanges,
      stats,
    );

    if (rowsToApply.length === 0) {
      console.log(`  ⏭️  No changes to apply`);
      return;
    }

    await this.processBatchPatch(
      revisionId,
      table,
      rowsToApply,
      stats,
      batchSize,
    );
  }

  private filterApplicableRows(
    table: string,
    tablePatchFiles: PatchFile[],
    rowsWithChanges: Map<string, boolean>,
    stats: ApplyStats,
  ): PatchFile[] {
    const rowsToApply: PatchFile[] = [];
    for (const patchFile of tablePatchFiles) {
      if (this.shouldSkipPatch(table, patchFile, rowsWithChanges)) {
        stats.skipped++;
        continue;
      }
      rowsToApply.push(patchFile);
    }
    return rowsToApply;
  }

  private shouldSkipPatch(
    table: string,
    patchFile: PatchFile,
    rowsWithChanges: Map<string, boolean>,
  ): boolean {
    const compositeKey = `${table}:${patchFile.rowId}`;
    return !rowsWithChanges.has(compositeKey) || patchFile.patches.length === 0;
  }

  private async processBatchPatch(
    revisionId: string,
    tableId: string,
    patchFiles: PatchFile[],
    stats: ApplyStats,
    batchSize: number,
  ): Promise<void> {
    if (this.coreApiService.bulkPatchSupported === false) {
      await this.patchRowsSingle(revisionId, tableId, patchFiles, stats);
      return;
    }

    let batchApplied = 0;

    for (let i = 0; i < patchFiles.length; i += batchSize) {
      const batch = patchFiles.slice(i, i + batchSize);

      this.printProgress({
        tableId,
        current: batchApplied,
        total: patchFiles.length,
      });

      try {
        const rows: PatchRowsRowDto[] = batch.map((pf) => ({
          rowId: pf.rowId,
          patches: pf.patches as PatchRow[],
        }));

        const result = await this.api.patchRows(revisionId, tableId, { rows });

        if (result.error) {
          if (this.is404Error(result.error)) {
            this.clearProgressLine();
            console.log(
              `  ⚠️ Bulk patchRows not supported, falling back to single-row mode`,
            );
            this.coreApiService.bulkPatchSupported = false;
            const remainingRows = patchFiles.slice(i);
            await this.patchRowsSingle(
              revisionId,
              tableId,
              remainingRows,
              stats,
            );
            return;
          }
          console.error(`\n❌ Batch patch failed:`, result.error);
          stats.applyErrors += batch.length;
          continue;
        }

        if (!result.data) {
          console.error(`\n❌ Batch patch failed: No data returned from API`);
          stats.applyErrors += batch.length;
          continue;
        }

        this.coreApiService.bulkPatchSupported = true;
        stats.applied += batch.length;
        batchApplied += batch.length;
      } catch (error) {
        if (this.is404Error(error)) {
          this.clearProgressLine();
          console.log(
            `  ⚠️ Bulk patchRows not supported, falling back to single-row mode`,
          );
          this.coreApiService.bulkPatchSupported = false;
          const remainingRows = patchFiles.slice(i);
          await this.patchRowsSingle(revisionId, tableId, remainingRows, stats);
          return;
        }
        console.error(`\n❌ Batch patch exception:`, error);
        stats.applyErrors += batch.length;
      }
    }

    this.printProgress({
      tableId,
      current: batchApplied,
      total: patchFiles.length,
    });
    this.clearProgressLine();
    console.log(`  ✅ Applied ${batchApplied} rows`);
  }

  private async patchRowsSingle(
    revisionId: string,
    tableId: string,
    patchFiles: PatchFile[],
    stats: ApplyStats,
  ): Promise<void> {
    let singleRowApplied = 0;

    for (let i = 0; i < patchFiles.length; i++) {
      const patchFile = patchFiles[i];

      this.printProgress({
        tableId,
        current: i,
        total: patchFiles.length,
      });

      const result = await this.applyPatchFile(patchFile, revisionId, tableId);

      if (result === 'applied') {
        stats.applied++;
        singleRowApplied++;
      } else {
        stats.applyErrors++;
      }
    }

    this.printProgress({
      tableId,
      current: patchFiles.length,
      total: patchFiles.length,
    });
    this.clearProgressLine();
    console.log(`  ✅ Applied ${singleRowApplied} rows (single-row mode)`);
  }

  private is404Error(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      return (
        errorObj['status'] === 404 ||
        (errorObj['response'] as Record<string, unknown> | undefined)?.[
          'status'
        ] === 404 ||
        errorObj['statusCode'] === 404
      );
    }
    return false;
  }

  private printProgress(state: ProgressState): void {
    const progress = `  Patching: ${state.current}/${state.total} rows`;
    process.stdout.write(`\r${progress}`);
  }

  private clearProgressLine(): void {
    process.stdout.write('\r\x1b[K');
  }

  private async applyPatchFile(
    patchFile: PatchFile,
    revisionId: string,
    table: string,
  ): Promise<'applied' | 'applyError'> {
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
    return parseBooleanOption(value);
  }

  @Option({
    flags: '--batch-size <size>',
    description: `Number of rows per batch for bulk operations (default: ${DEFAULT_BATCH_SIZE})`,
    required: false,
  })
  parseBatchSize(val: string) {
    const size = Number.parseInt(val, 10);
    if (Number.isNaN(size) || size < 1) {
      throw new Error('Batch size must be a positive integer');
    }
    return size;
  }
}
