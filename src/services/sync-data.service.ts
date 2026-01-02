import { Injectable } from '@nestjs/common';
import { SyncApiService, ConnectionInfo } from './sync-api.service';
import { TableDependencyService } from './table-dependency.service';
import {
  RowSyncService,
  RowData,
  BulkSupportFlags,
  ApiClient,
  RowSyncError,
  ProgressState,
} from './row-sync.service';
import {
  DataSyncResult,
  SyncOptions,
  TableSyncResult,
} from '../types/sync.types';
import { JsonValue } from '../types/json.types';
import { JsonSchema } from '../types/schema.types';

const DEFAULT_BATCH_SIZE = 100;

@Injectable()
export class SyncDataService {
  constructor(
    private readonly syncApi: SyncApiService,
    private readonly tableDependency: TableDependencyService,
    private readonly rowSync: RowSyncService,
  ) {}

  async sync(options: SyncOptions = {}): Promise<DataSyncResult> {
    const source = this.syncApi.source;
    const target = this.syncApi.target;
    const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;

    console.log('\n📋 Syncing data...');

    const tables = await this.getTablesToSync(source, options.tables);

    if (tables.length === 0) {
      console.log('  ✓ No tables to sync');
      return this.createEmptyResult();
    }

    console.log(`  Found ${tables.length} table(s) to sync`);

    const tableSchemas = await this.getTableSchemas(source, tables);
    const sortedTables = this.sortTablesByDependencies(tables, tableSchemas);

    if (options.dryRun) {
      return this.analyzeTables(source, target, sortedTables);
    }

    return this.syncTables(source, target, sortedTables, batchSize);
  }

  private async getTableSchemas(
    connection: ConnectionInfo,
    tables: string[],
  ): Promise<Record<string, JsonSchema>> {
    const schemas: Record<string, JsonSchema> = {};

    for (const tableId of tables) {
      try {
        const result = await connection.client.api.tableSchema(
          connection.revisionId,
          tableId,
        );

        if (result.data) {
          schemas[tableId] = result.data as JsonSchema;
        }
      } catch (error) {
        console.warn(
          `  ⚠️ Could not fetch schema for table ${tableId}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return schemas;
  }

  private sortTablesByDependencies(
    tables: string[],
    schemas: Record<string, JsonSchema>,
  ): string[] {
    const dependencyResult = this.tableDependency.analyzeDependencies(schemas);

    console.log(
      this.tableDependency.formatDependencyInfo(dependencyResult, tables),
    );

    for (const warning of dependencyResult.warnings) {
      console.warn(warning);
    }

    return dependencyResult.sortedTables.filter((tableId) =>
      tables.includes(tableId),
    );
  }

  private async getTablesToSync(
    connection: ConnectionInfo,
    tableFilter?: string[],
  ): Promise<string[]> {
    const tables: string[] = [];
    let cursor: string | undefined;

    do {
      const result = await connection.client.api.tables({
        revisionId: connection.revisionId,
        first: 100,
        after: cursor,
      });

      if (result.error) {
        throw new Error(
          `Failed to get tables: ${JSON.stringify(result.error)}`,
        );
      }

      for (const edge of result.data.edges) {
        const tableId = edge.node.id;
        if (!tableFilter || tableFilter.includes(tableId)) {
          tables.push(tableId);
        }
      }

      cursor = result.data.pageInfo.hasNextPage
        ? result.data.pageInfo.endCursor
        : undefined;
    } while (cursor);

    return tables;
  }

  private async getSourceRows(
    connection: ConnectionInfo,
    tableId: string,
  ): Promise<RowData[]> {
    const rows: RowData[] = [];
    let cursor: string | undefined;

    do {
      const result = await connection.client.api.rows(
        connection.revisionId,
        tableId,
        {
          first: 100,
          after: cursor,
          orderBy: [{ field: 'id', direction: 'asc' }],
        },
      );

      if (result.error) {
        throw new Error(`Failed to get rows: ${JSON.stringify(result.error)}`);
      }

      for (const edge of result.data.edges) {
        rows.push({
          id: edge.node.id,
          data: edge.node.data as Record<string, unknown>,
        });
      }

      this.printProgress(
        { operation: 'fetch', current: rows.length },
        'Loading from source',
      );

      cursor = result.data.pageInfo.hasNextPage
        ? result.data.pageInfo.endCursor
        : undefined;
    } while (cursor);

    this.clearProgressLine();
    return rows;
  }

  private async analyzeTables(
    source: ConnectionInfo,
    target: ConnectionInfo,
    tables: string[],
  ): Promise<DataSyncResult> {
    const tableResults: TableSyncResult[] = [];
    let totalRowsCreated = 0;
    let totalRowsUpdated = 0;
    let totalRowsSkipped = 0;

    console.log('\n  📊 Dry run analysis:');

    for (const tableId of tables) {
      const sourceRows = await this.getSourceRows(source, tableId);

      let existingRows: Map<string, JsonValue>;
      try {
        existingRows = await this.rowSync.getExistingRows(
          target.client.api as unknown as ApiClient,
          target.draftRevisionId,
          tableId,
        );
      } catch {
        console.warn(
          `    ⚠️ Could not read existing rows for table "${tableId}" in target (table may not exist yet)`,
        );
        existingRows = new Map<string, JsonValue>();
      }

      const { rowsToCreate, rowsToUpdate, skippedCount } =
        this.rowSync.categorizeRows(sourceRows, existingRows);

      const toCreate = rowsToCreate.length;
      const toUpdate = rowsToUpdate.length;
      const toSkip = skippedCount;

      if (toCreate > 0 || toUpdate > 0) {
        console.log(
          `    ${tableId}: ${toCreate} to create, ${toUpdate} to update, ${toSkip} unchanged`,
        );
      }

      tableResults.push({
        tableId,
        rowsCreated: toCreate,
        rowsUpdated: toUpdate,
        rowsSkipped: toSkip,
        errors: 0,
      });

      totalRowsCreated += toCreate;
      totalRowsUpdated += toUpdate;
      totalRowsSkipped += toSkip;
    }

    return {
      tables: tableResults,
      totalRowsCreated,
      totalRowsUpdated,
      totalRowsSkipped,
      totalErrors: 0,
    };
  }

  private async syncTables(
    source: ConnectionInfo,
    target: ConnectionInfo,
    tables: string[],
    batchSize: number,
  ): Promise<DataSyncResult> {
    const tableResults: TableSyncResult[] = [];
    let totalRowsCreated = 0;
    let totalRowsUpdated = 0;
    let totalRowsSkipped = 0;

    const bulkFlags: BulkSupportFlags = {};

    for (const tableId of tables) {
      try {
        const result = await this.syncTable(
          source,
          target,
          tableId,
          batchSize,
          bulkFlags,
        );

        tableResults.push(result);
        totalRowsCreated += result.rowsCreated;
        totalRowsUpdated += result.rowsUpdated;
        totalRowsSkipped += result.rowsSkipped;
      } catch (error) {
        if (error instanceof RowSyncError) {
          this.printRowSyncError(error, batchSize);
        } else {
          console.error(
            `\n❌ Sync stopped due to error in table "${tableId}":`,
            error instanceof Error ? error.message : String(error),
          );
        }
        throw error;
      }
    }

    console.log(`  ✓ Synced ${totalRowsCreated + totalRowsUpdated} row(s)`);

    return {
      tables: tableResults,
      totalRowsCreated,
      totalRowsUpdated,
      totalRowsSkipped,
      totalErrors: 0,
    };
  }

  private printRowSyncError(error: RowSyncError, batchSize: number): void {
    console.error(`\n❌ Sync stopped due to error in table "${error.tableId}"`);
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

  private async syncTable(
    source: ConnectionInfo,
    target: ConnectionInfo,
    tableId: string,
    batchSize: number,
    bulkFlags: BulkSupportFlags,
  ): Promise<TableSyncResult> {
    console.log(`  📋 Processing table: ${tableId}`);

    const sourceRows = await this.getSourceRows(source, tableId);
    console.log(`    📊 Found ${sourceRows.length} rows in source`);

    const stats = await this.rowSync.syncTableRows(
      target.client.api as unknown as ApiClient,
      target.draftRevisionId,
      tableId,
      sourceRows,
      batchSize,
      bulkFlags,
      (state) => this.printProgress(state),
    );

    this.clearProgressLine();
    console.log(
      `  ✅ ${tableId}: ${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped`,
    );

    return {
      tableId,
      rowsCreated: stats.created,
      rowsUpdated: stats.updated,
      rowsSkipped: stats.skipped,
      errors: 0,
    };
  }

  private printProgress(state: ProgressState, label?: string): void {
    let operationLabel: string;
    let progress: string;

    if (state.operation === 'fetch') {
      operationLabel = label ?? 'Fetching';
      progress = `    ${operationLabel}: ${state.current} rows`;
    } else {
      operationLabel = state.operation === 'create' ? 'Creating' : 'Updating';
      progress = `    ${operationLabel}: ${state.current}/${state.total} rows`;
    }

    process.stdout.write(`\r${progress}`);
  }

  private clearProgressLine(): void {
    process.stdout.write('\r\x1b[K');
  }

  private createEmptyResult(): DataSyncResult {
    return {
      tables: [],
      totalRowsCreated: 0,
      totalRowsUpdated: 0,
      totalRowsSkipped: 0,
      totalErrors: 0,
    };
  }
}
