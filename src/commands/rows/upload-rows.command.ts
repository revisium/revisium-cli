import { Option, SubCommand } from 'nest-commander';
import { BaseCommand, BaseOptions } from 'src/commands/base.command';
import {
  ConnectionService,
  createApiClientAdapter,
} from 'src/services/connection';
import { JsonValidatorService, LoggerService } from 'src/services/common';
import {
  CommitRevisionService,
  FileRowLoaderService,
  RowSyncService,
  RowSyncError,
  TableDependencyService,
} from 'src/services/sync';
import { JsonSchema } from 'src/types/schema.types';
import { JsonValue } from 'src/types/json.types';
import { formatBatchError } from 'src/utils/error-formatter.utils';
import { parseBooleanOption } from 'src/utils/parse-boolean.utils';
import { clearProgressLine, printProgress } from 'src/utils/progress';
import {
  UploadStats,
  createEmptyUploadStats,
  aggregateUploadStats,
  formatUploadSummary,
  formatTableResult,
} from 'src/utils/stats-formatter.utils';

const DEFAULT_BATCH_SIZE = 100;

type Options = BaseOptions & {
  folder: string;
  tables?: string;
  commit?: boolean;
  batchSize?: number;
};

@SubCommand({
  name: 'upload',
  description: 'Upload rows from JSON files to Revisium tables',
})
export class UploadRowsCommand extends BaseCommand {
  constructor(
    private readonly connectionService: ConnectionService,
    private readonly jsonValidatorService: JsonValidatorService,
    private readonly tableDependencyService: TableDependencyService,
    private readonly commitRevisionService: CommitRevisionService,
    private readonly fileRowLoader: FileRowLoaderService,
    private readonly rowSyncService: RowSyncService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.folder) {
      throw new Error('Error: --folder option is required');
    }

    await this.connectionService.connect(options);
    const revisionId = this.connectionService.draftRevisionId;
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

    const totalStats = await this.uploadAllTableRows(
      revisionId,
      options.folder,
      options.tables,
      batchSize,
    );

    const totalChanges = totalStats.uploaded + totalStats.updated;
    await this.commitRevisionService.handleCommitFlow(
      options.commit,
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
    const tableIds = await this.fileRowLoader.getTableIds(
      folderPath,
      tableFilter,
    );
    this.logger.foundItems(tableIds.length, 'tables to process');

    const tableSchemas = await this.fetchTableSchemas(revisionId, tableIds);
    const sortedTables = this.getSortedTables(tableSchemas, tableIds);

    const totalStats = createEmptyUploadStats();

    for (const tableId of sortedTables) {
      try {
        const tableStats = await this.uploadTableRows(
          revisionId,
          tableId,
          folderPath,
          tableSchemas[tableId],
          batchSize,
        );
        aggregateUploadStats(totalStats, tableStats);
      } catch (error) {
        this.handleError(error, tableId, batchSize);
        throw error;
      }
    }

    this.logger.lines(formatUploadSummary(totalStats));

    return totalStats;
  }

  private async fetchTableSchemas(
    revisionId: string,
    tables: string[],
  ): Promise<Record<string, JsonSchema>> {
    const schemas: Record<string, JsonSchema> = {};

    for (const tableId of tables) {
      try {
        const result = await this.api.tableSchema(revisionId, tableId);
        if (result.data) {
          schemas[tableId] = result.data as JsonSchema;
        }
      } catch (error) {
        this.logger.warn(
          `Could not fetch schema for table ${tableId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return schemas;
  }

  private getSortedTables(
    schemas: Record<string, JsonSchema>,
    originalTables: string[],
  ): string[] {
    const result = this.tableDependencyService.analyzeDependencies(schemas);

    this.logger.info(
      this.tableDependencyService.formatDependencyInfo(result, originalTables),
    );

    for (const warning of result.warnings) {
      this.logger.warn(warning.replace(/^⚠️\s*/, ''));
    }

    return result.sortedTables.filter((id) => originalTables.includes(id));
  }

  private async uploadTableRows(
    revisionId: string,
    tableId: string,
    folderPath: string,
    schema: JsonSchema | undefined,
    batchSize: number,
  ): Promise<UploadStats> {
    this.logger.processingTable(tableId);

    const validator = schema
      ? (data: JsonValue) =>
          this.jsonValidatorService.validateSchema(schema)(data)
      : undefined;

    const loadResult = await this.fileRowLoader.loadTableRows(
      folderPath,
      tableId,
      validator,
    );

    const stats: UploadStats = {
      totalRows: loadResult.totalFiles,
      uploaded: 0,
      updated: 0,
      skipped: 0,
      invalidSchema: loadResult.invalidCount,
      createErrors: 0,
      updateErrors: 0,
      otherErrors: loadResult.parseErrors,
    };

    this.logger.indent(`📊 Found ${stats.totalRows} rows in table ${tableId}`);

    if (loadResult.rows.length === 0) {
      this.logger.info(formatTableResult(tableId, stats));
      return stats;
    }

    const apiClient = createApiClientAdapter(this.api);
    const syncStats = await this.rowSyncService.syncTableRows(
      apiClient,
      revisionId,
      tableId,
      loadResult.rows,
      batchSize,
      (state) => printProgress(state, { indent: '  ' }),
    );

    clearProgressLine();

    stats.uploaded = syncStats.created;
    stats.updated = syncStats.updated;
    stats.skipped = syncStats.skipped;
    stats.createErrors = syncStats.createErrors;
    stats.updateErrors = syncStats.updateErrors;

    this.logger.info(formatTableResult(tableId, stats));
    return stats;
  }

  private handleError(
    error: unknown,
    tableId: string,
    batchSize: number,
  ): void {
    if (error instanceof RowSyncError) {
      const lines = formatBatchError(
        {
          tableId: error.tableId,
          message: error.message,
          statusCode: error.statusCode,
          batchSize: error.batchSize,
        },
        batchSize,
      );
      this.logger.errorLines(lines);
    } else {
      this.logger.error(
        `Upload stopped due to error in table "${tableId}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private get api() {
    return this.connectionService.api;
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
