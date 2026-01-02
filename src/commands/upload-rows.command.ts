import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { Option, SubCommand } from 'nest-commander';
import { BaseCommand } from 'src/commands/base.command';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';
import { JsonValidatorService } from 'src/services/json-validator.service';
import { TableDependencyService } from 'src/services/table-dependency.service';
import { CommitRevisionService } from 'src/services/commit-revision.service';
import { JsonValue } from 'src/types/json.types';
import { JsonSchema } from 'src/types/schema.types';

const DEFAULT_BATCH_SIZE = 100;

interface ProgressState {
  tableId: string;
  operation: 'create' | 'update' | 'fetch';
  current: number;
  total: number;
}

type Options = {
  folder: string;
  tables?: string;
  commit?: boolean;
  batchSize?: number;
  organization?: string;
  project?: string;
  branch?: string;
};

interface UploadStats {
  totalRows: number;
  uploaded: number;
  updated: number;
  skipped: number;
  invalidSchema: number;
  createErrors: number;
  updateErrors: number;
  otherErrors: number;
}

interface RowData {
  id: string;
  data: JsonValue;
  [key: string]: any;
}

class UploadError extends Error {
  constructor(
    message: string,
    public readonly tableId: string,
    public readonly statusCode?: number,
    public readonly batchSize?: number,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

@SubCommand({
  name: 'upload',
  description: 'Upload rows from JSON files to Revisium tables',
})
export class UploadRowsCommand extends BaseCommand {
  constructor(
    private readonly coreApiService: CoreApiService,
    private readonly draftRevisionService: DraftRevisionService,
    private readonly jsonValidatorService: JsonValidatorService,
    private readonly tableDependencyService: TableDependencyService,
    private readonly commitRevisionService: CommitRevisionService,
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
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const totalStats = await this.uploadAllTableRows(
      revisionId,
      options.folder,
      options.tables,
      batchSize,
    );

    const totalChanges = totalStats.uploaded + totalStats.updated;
    await this.commitRevisionService.handleCommitFlow(
      options,
      'Uploaded',
      totalChanges,
    );
  }

  private async uploadAllTableRows(
    revisionId: string,
    folderPath: string,
    tableFilter: string | undefined,
    batchSize: number,
  ): Promise<UploadStats> {
    try {
      const originalTables = await this.getTargetTables(
        folderPath,
        tableFilter,
      );

      console.log(`📊 Found ${originalTables.length} tables to process`);

      const tableSchemas: Record<string, JsonSchema> = {};
      for (const tableId of originalTables) {
        try {
          const schemaResult = await this.api.tableSchema(revisionId, tableId);
          tableSchemas[tableId] = schemaResult.data as JsonSchema;
        } catch (error) {
          console.warn(
            `⚠️  Could not fetch schema for table ${tableId}:`,
            error,
          );
        }
      }

      const dependencyResult =
        this.tableDependencyService.analyzeDependencies(tableSchemas);

      console.log(
        this.tableDependencyService.formatDependencyInfo(
          dependencyResult,
          originalTables,
        ),
      );

      for (const warning of dependencyResult.warnings) {
        console.warn(warning);
      }

      const tablesToProcess = dependencyResult.sortedTables.filter((tableId) =>
        originalTables.includes(tableId),
      );

      const totalStats: UploadStats = {
        totalRows: 0,
        uploaded: 0,
        updated: 0,
        skipped: 0,
        invalidSchema: 0,
        createErrors: 0,
        updateErrors: 0,
        otherErrors: 0,
      };

      for (const tableId of tablesToProcess) {
        try {
          const tableStats = await this.uploadRowsToTable(
            revisionId,
            tableId,
            folderPath,
            batchSize,
          );
          this.aggregateStats(totalStats, tableStats);
        } catch (error) {
          if (error instanceof UploadError) {
            this.printUploadError(error, batchSize);
          } else {
            console.error(
              `\n❌ Upload stopped due to error in table "${tableId}":`,
              error instanceof Error ? error.message : String(error),
            );
          }
          throw error;
        }
      }

      this.printFinalStats(totalStats);
      return totalStats;
    } catch (error) {
      if (!(error instanceof UploadError)) {
        console.error(
          'Error uploading table rows:',
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }
  }

  private printUploadError(error: UploadError, batchSize: number): void {
    console.error(
      `\n❌ Upload stopped due to error in table "${error.tableId}"`,
    );
    console.error(`   Error: ${error.message}`);

    if (error.statusCode === 413) {
      console.error(`\n💡 The request payload is too large (HTTP 413).`);
      console.error(
        `   Current batch size: ${error.batchSize ?? batchSize} rows`,
      );
      console.error(`   Try reducing the batch size with --batch-size option.`);
      console.error(`   Example: --batch-size 50 or --batch-size 10`);
    } else if (error.statusCode) {
      console.error(`   HTTP status code: ${error.statusCode}`);
    }
  }

  private async getTargetTables(
    folderPath: string,
    tableFilter?: string,
  ): Promise<string[]> {
    if (tableFilter) {
      return tableFilter.split(',').map((id) => id.trim());
    }

    const entries = await readdir(folderPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }

  private async uploadRowsToTable(
    revisionId: string,
    tableId: string,
    folderPath: string,
    batchSize: number,
  ): Promise<UploadStats> {
    const stats: UploadStats = {
      totalRows: 0,
      uploaded: 0,
      updated: 0,
      skipped: 0,
      invalidSchema: 0,
      createErrors: 0,
      updateErrors: 0,
      otherErrors: 0,
    };

    try {
      console.log(`📋 Processing table: ${tableId}`);

      const schemaResult = await this.api.tableSchema(revisionId, tableId);
      const tableSchema = schemaResult.data as JsonSchema;
      const validator = this.createDataValidator(tableSchema);

      const tableFolderPath = join(folderPath, tableId);
      const allRows = await this.collectAndValidateRows(
        tableFolderPath,
        validator,
        stats,
      );

      console.log(`  📊 Found ${stats.totalRows} rows in table ${tableId}`);

      const existingRows = await this.getExistingRows(revisionId, tableId);
      console.log(`  📥 Fetched ${existingRows.size} existing rows from API`);

      const { rowsToCreate, rowsToUpdate, skippedCount } = this.categorizeRows(
        allRows,
        existingRows,
      );
      stats.skipped = skippedCount;

      if (rowsToCreate.length > 0 && rowsToCreate.length <= 20) {
        console.log(
          `  📝 Rows to create: ${rowsToCreate.map((r) => r.id).join(', ')}`,
        );
      } else if (rowsToCreate.length > 20) {
        console.log(
          `  📝 Rows to create (first 20): ${rowsToCreate
            .slice(0, 20)
            .map((r) => r.id)
            .join(', ')}...`,
        );
      }

      await this.processBatchCreate(
        revisionId,
        tableId,
        rowsToCreate,
        stats,
        batchSize,
      );
      await this.processBatchUpdate(
        revisionId,
        tableId,
        rowsToUpdate,
        stats,
        batchSize,
      );

      console.log(
        `✅ Table ${tableId}: ${stats.uploaded} uploaded, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.invalidSchema} invalid schema, ${stats.createErrors} create errors, ${stats.updateErrors} update errors, ${stats.otherErrors} other errors`,
      );

      return stats;
    } catch (error) {
      console.error(`❌ Failed to process table ${tableId}:`, error);
      stats.otherErrors = stats.totalRows;
      return stats;
    }
  }

  private async collectAndValidateRows(
    tableFolderPath: string,
    validator: (data: JsonValue) => boolean,
    stats: UploadStats,
  ): Promise<RowData[]> {
    const rowFiles = await readdir(tableFolderPath);
    const jsonFiles = rowFiles.filter((file) => file.endsWith('.json'));
    stats.totalRows = jsonFiles.length;

    const validRows: RowData[] = [];

    for (const fileName of jsonFiles) {
      const filePath = join(tableFolderPath, fileName);
      try {
        const fileContent = await readFile(filePath, 'utf-8');
        const rowData = JSON.parse(fileContent) as RowData;

        if (!validator(rowData.data)) {
          stats.invalidSchema++;
          continue;
        }

        validRows.push(rowData);
      } catch {
        stats.otherErrors++;
      }
    }

    return validRows;
  }

  private async getExistingRows(
    revisionId: string,
    tableId: string,
  ): Promise<Map<string, JsonValue>> {
    const existingRows = new Map<string, JsonValue>();
    let after: string | undefined;
    let hasMore = true;
    let pageCount = 0;

    this.printProgress({
      tableId,
      operation: 'fetch',
      current: 0,
      total: 0,
    });

    while (hasMore) {
      // Sort by unique field (id) to ensure stable pagination.
      // Without explicit ordering, PostgreSQL may return rows in inconsistent order
      // between paginated requests, causing some rows to be skipped.
      const result = await this.api.rows(revisionId, tableId, {
        first: 100,
        after,
        orderBy: [{ field: 'id', direction: 'asc' }],
      });

      pageCount++;

      if (result.error) {
        this.clearProgressLine();
        console.warn(
          `  ⚠️ Error fetching rows (page ${pageCount}):`,
          result.error,
        );
        break;
      }

      if (!result.data) {
        this.clearProgressLine();
        console.warn(`  ⚠️ No data in response (page ${pageCount})`);
        break;
      }

      const { edges, pageInfo } = result.data;

      for (const edge of edges) {
        existingRows.set(edge.node.id, edge.node.data);
      }

      this.printProgress({
        tableId,
        operation: 'fetch',
        current: existingRows.size,
        total: 0,
      });

      hasMore = pageInfo.hasNextPage;
      after = pageInfo.endCursor;
    }

    this.clearProgressLine();
    return existingRows;
  }

  private categorizeRows(
    allRows: RowData[],
    existingRows: Map<string, JsonValue>,
  ): {
    rowsToCreate: RowData[];
    rowsToUpdate: RowData[];
    skippedCount: number;
  } {
    const rowsToCreate: RowData[] = [];
    const rowsToUpdate: RowData[] = [];
    let skippedCount = 0;

    for (const row of allRows) {
      const existingData = existingRows.get(row.id);

      if (existingData === undefined) {
        rowsToCreate.push(row);
      } else if (!this.isDataIdentical(row.data, existingData)) {
        rowsToUpdate.push(row);
      } else {
        skippedCount++;
      }
    }

    return { rowsToCreate, rowsToUpdate, skippedCount };
  }

  private async processBatchCreate(
    revisionId: string,
    tableId: string,
    rows: RowData[],
    stats: UploadStats,
    batchSize: number,
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    if (this.coreApiService.bulkCreateSupported === false) {
      await this.createRowsSingle(revisionId, tableId, rows, stats);
      return;
    }

    let processed = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      this.printProgress({
        tableId,
        operation: 'create',
        current: processed,
        total: rows.length,
      });

      try {
        const result = await this.api.createRows(revisionId, tableId, {
          rows: batch.map((r) => ({ rowId: r.id, data: r.data as object })),
          isRestore: true,
        });

        if (result.error) {
          if (this.is404Error(result.error)) {
            this.clearProgressLine();
            console.log(
              `  ⚠️ Bulk createRows not supported, falling back to single-row mode`,
            );
            this.coreApiService.bulkCreateSupported = false;
            const remainingRows = rows.slice(i);
            await this.createRowsSingle(
              revisionId,
              tableId,
              remainingRows,
              stats,
            );
            return;
          }

          this.clearProgressLine();
          const statusCode = this.getErrorStatusCode(result.error);
          throw new UploadError(
            `Batch create failed: ${JSON.stringify(result.error)}`,
            tableId,
            statusCode,
            batchSize,
          );
        }

        this.coreApiService.bulkCreateSupported = true;
        stats.uploaded += batch.length;
        processed += batch.length;
      } catch (error: unknown) {
        if (error instanceof UploadError) {
          throw error;
        }

        if (this.is404Error(error)) {
          this.clearProgressLine();
          console.log(
            `  ⚠️ Bulk createRows not supported, falling back to single-row mode`,
          );
          this.coreApiService.bulkCreateSupported = false;
          const remainingRows = rows.slice(i);
          await this.createRowsSingle(
            revisionId,
            tableId,
            remainingRows,
            stats,
          );
          return;
        }

        this.clearProgressLine();
        const statusCode = this.getErrorStatusCode(error);
        throw new UploadError(
          `Batch create exception: ${error instanceof Error ? error.message : String(error)}`,
          tableId,
          statusCode,
          batchSize,
        );
      }
    }

    this.clearProgressLine();
  }

  private async processBatchUpdate(
    revisionId: string,
    tableId: string,
    rows: RowData[],
    stats: UploadStats,
    batchSize: number,
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    if (this.coreApiService.bulkUpdateSupported === false) {
      await this.updateRowsSingle(revisionId, tableId, rows, stats);
      return;
    }

    let processed = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      this.printProgress({
        tableId,
        operation: 'update',
        current: processed,
        total: rows.length,
      });

      try {
        const result = await this.api.updateRows(revisionId, tableId, {
          rows: batch.map((r) => ({ rowId: r.id, data: r.data as object })),
        });

        if (result.error) {
          if (this.is404Error(result.error)) {
            this.clearProgressLine();
            console.log(
              `  ⚠️ Bulk updateRows not supported, falling back to single-row mode`,
            );
            this.coreApiService.bulkUpdateSupported = false;
            const remainingRows = rows.slice(i);
            await this.updateRowsSingle(
              revisionId,
              tableId,
              remainingRows,
              stats,
            );
            return;
          }

          this.clearProgressLine();
          const statusCode = this.getErrorStatusCode(result.error);
          throw new UploadError(
            `Batch update failed: ${JSON.stringify(result.error)}`,
            tableId,
            statusCode,
            batchSize,
          );
        }

        this.coreApiService.bulkUpdateSupported = true;
        stats.updated += batch.length;
        processed += batch.length;
      } catch (error: unknown) {
        if (error instanceof UploadError) {
          throw error;
        }

        if (this.is404Error(error)) {
          this.clearProgressLine();
          console.log(
            `  ⚠️ Bulk updateRows not supported, falling back to single-row mode`,
          );
          this.coreApiService.bulkUpdateSupported = false;
          const remainingRows = rows.slice(i);
          await this.updateRowsSingle(
            revisionId,
            tableId,
            remainingRows,
            stats,
          );
          return;
        }

        this.clearProgressLine();
        const statusCode = this.getErrorStatusCode(error);
        throw new UploadError(
          `Batch update exception: ${error instanceof Error ? error.message : String(error)}`,
          tableId,
          statusCode,
          batchSize,
        );
      }
    }

    this.clearProgressLine();
  }

  private async createRowsSingle(
    revisionId: string,
    tableId: string,
    rows: RowData[],
    stats: UploadStats,
  ): Promise<void> {
    let processed = 0;
    for (const row of rows) {
      this.printProgress({
        tableId,
        operation: 'create',
        current: processed,
        total: rows.length,
      });

      try {
        const result = await this.api.createRow(revisionId, tableId, {
          rowId: row.id,
          data: row.data as object,
          isRestore: true,
        });

        if (result.error) {
          this.clearProgressLine();
          const statusCode = this.getErrorStatusCode(result.error);
          throw new UploadError(
            `Failed to create row ${row.id}: ${JSON.stringify(result.error)}`,
            tableId,
            statusCode,
          );
        }

        stats.uploaded++;
      } catch (error) {
        if (error instanceof UploadError) {
          throw error;
        }

        this.clearProgressLine();
        const statusCode = this.getErrorStatusCode(error);
        throw new UploadError(
          `Failed to create row ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
          tableId,
          statusCode,
        );
      }
      processed++;
    }

    this.clearProgressLine();
  }

  private async updateRowsSingle(
    revisionId: string,
    tableId: string,
    rows: RowData[],
    stats: UploadStats,
  ): Promise<void> {
    let processed = 0;
    for (const row of rows) {
      this.printProgress({
        tableId,
        operation: 'update',
        current: processed,
        total: rows.length,
      });

      try {
        const result = await this.api.updateRow(revisionId, tableId, row.id, {
          data: row.data as object,
          isRestore: true,
        });

        if (result.error) {
          this.clearProgressLine();
          const statusCode = this.getErrorStatusCode(result.error);
          throw new UploadError(
            `Failed to update row ${row.id}: ${JSON.stringify(result.error)}`,
            tableId,
            statusCode,
          );
        }

        stats.updated++;
      } catch (error) {
        if (error instanceof UploadError) {
          throw error;
        }

        this.clearProgressLine();
        const statusCode = this.getErrorStatusCode(error);
        throw new UploadError(
          `Failed to update row ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
          tableId,
          statusCode,
        );
      }
      processed++;
    }

    this.clearProgressLine();
  }

  private is404Error(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      if (err.status === 404 || err.statusCode === 404) {
        return true;
      }
      if (
        typeof err.response === 'object' &&
        err.response !== null &&
        (err.response as Record<string, unknown>).status === 404
      ) {
        return true;
      }
    }
    return false;
  }

  private getErrorStatusCode(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      if (typeof err['statusCode'] === 'number') {
        return err['statusCode'];
      }
      if (typeof err['status'] === 'number') {
        return err['status'];
      }
    }
    return undefined;
  }

  private createDataValidator(
    tableSchema: JsonSchema,
  ): (rowData: JsonValue) => boolean {
    if (tableSchema) {
      const validate = this.jsonValidatorService.validateSchema(tableSchema);
      return (rowData: JsonValue) => validate(rowData);
    }

    return () => false;
  }

  private isDataIdentical(data1: JsonValue, data2: JsonValue): boolean {
    return JSON.stringify(data1) === JSON.stringify(data2);
  }

  private aggregateStats(total: UploadStats, table: UploadStats) {
    total.totalRows += table.totalRows;
    total.uploaded += table.uploaded;
    total.updated += table.updated;
    total.skipped += table.skipped;
    total.invalidSchema += table.invalidSchema;
    total.createErrors += table.createErrors;
    total.updateErrors += table.updateErrors;
    total.otherErrors += table.otherErrors;
  }

  private printFinalStats(stats: UploadStats) {
    console.log('\n🎉 Upload Summary:');
    console.log(`📊 Total rows processed: ${stats.totalRows}`);
    console.log(`⬆️  Uploaded (new): ${stats.uploaded}`);
    console.log(`🔄 Updated (changed): ${stats.updated}`);
    console.log(`⏭️  Skipped (identical): ${stats.skipped}`);
    console.log(`❌ Invalid schema: ${stats.invalidSchema}`);
    console.log(`🚫 Create errors: ${stats.createErrors}`);
    console.log(`⚠️  Update errors: ${stats.updateErrors}`);
    console.log(`💥 Other errors: ${stats.otherErrors}`);

    const successful = stats.uploaded + stats.updated;
    const total = stats.totalRows;
    const totalErrors =
      stats.createErrors + stats.updateErrors + stats.otherErrors;
    const successRate =
      total > 0 ? ((successful / total) * 100).toFixed(1) : '0';
    console.log(
      `✅ Success rate: ${successRate}% (${totalErrors} total errors)`,
    );
  }

  private get api() {
    return this.coreApiService.api;
  }

  private printProgress(state: ProgressState): void {
    let operationLabel: string;
    let progress: string;

    if (state.operation === 'fetch') {
      operationLabel = 'Fetching existing';
      progress = `  ${operationLabel}: ${state.current} rows`;
    } else {
      operationLabel = state.operation === 'create' ? 'Creating' : 'Updating';
      progress = `  ${operationLabel}: ${state.current}/${state.total} rows`;
    }

    process.stdout.write(`\r${progress}`);
  }

  private clearProgressLine(): void {
    process.stdout.write('\r\x1b[K');
  }

  @Option({
    flags: '-f, --folder <folder>',
    description: 'Folder path containing row files',
    required: true,
  })
  parseFolder(val: string) {
    return val;
  }

  @Option({
    flags: '-t, --tables <tables>',
    description:
      'Comma-separated table IDs (e.g., table1,table2). If not specified, processes all tables found in folder.',
    required: false,
  })
  parseTables(val: string) {
    return val;
  }

  @Option({
    flags: '-c, --commit [boolean]',
    description: 'Create a revision after uploading rows',
  })
  parseCommit(value?: string) {
    return JSON.parse(value ?? 'true') as boolean;
  }

  @Option({
    flags: '--batch-size <size>',
    description: `Number of rows per batch for bulk operations (default: ${DEFAULT_BATCH_SIZE})`,
    required: false,
  })
  parseBatchSize(val: string) {
    const size = parseInt(val, 10);
    if (isNaN(size) || size < 1) {
      throw new Error('Batch size must be a positive integer');
    }
    return size;
  }
}
