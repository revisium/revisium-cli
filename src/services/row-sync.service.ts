import { Injectable } from '@nestjs/common';
import * as objectHash from 'object-hash';
import { JsonValue } from '../types/json.types';

export interface RowData {
  id: string;
  data: Record<string, unknown>;
}

export interface RowSyncStats {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  createErrors: number;
  updateErrors: number;
}

export class RowSyncError extends Error {
  constructor(
    message: string,
    public readonly tableId: string,
    public readonly statusCode?: number,
    public readonly batchSize?: number,
  ) {
    super(message);
    this.name = 'RowSyncError';
  }
}

export interface ApiClient {
  rows(
    revisionId: string,
    tableId: string,
    options: { first: number; after?: string; orderBy?: unknown[] },
  ): Promise<{
    data?: {
      edges: { node: { id: string; data: unknown } }[];
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
    error?: unknown;
  }>;

  createRows(
    revisionId: string,
    tableId: string,
    data: { rows: { rowId: string; data: object }[]; isRestore?: boolean },
  ): Promise<{ data?: unknown; error?: unknown }>;

  updateRows(
    revisionId: string,
    tableId: string,
    data: { rows: { rowId: string; data: object }[] },
  ): Promise<{ data?: unknown; error?: unknown }>;

  createRow(
    revisionId: string,
    tableId: string,
    data: { rowId: string; data: object; isRestore?: boolean },
  ): Promise<{ data?: unknown; error?: unknown }>;

  updateRow(
    revisionId: string,
    tableId: string,
    rowId: string,
    data: { data: object },
  ): Promise<{ data?: unknown; error?: unknown }>;
}

export interface BulkSupportFlags {
  bulkCreateSupported?: boolean;
  bulkUpdateSupported?: boolean;
}

export type ProgressOperation = 'fetch' | 'create' | 'update';

export interface ProgressState {
  operation: ProgressOperation;
  current: number;
  total?: number;
}

export type ProgressCallback = (state: ProgressState) => void;

const DEFAULT_BATCH_SIZE = 100;

@Injectable()
export class RowSyncService {
  async syncTableRows(
    api: ApiClient,
    sourceRevisionId: string,
    targetRevisionId: string,
    tableId: string,
    sourceRows: RowData[],
    batchSize: number = DEFAULT_BATCH_SIZE,
    bulkFlags: BulkSupportFlags = {},
    onProgress?: ProgressCallback,
  ): Promise<RowSyncStats> {
    const stats: RowSyncStats = {
      totalRows: sourceRows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      createErrors: 0,
      updateErrors: 0,
    };

    const existingRows = await this.getExistingRows(
      api,
      targetRevisionId,
      tableId,
      onProgress,
    );

    const { rowsToCreate, rowsToUpdate, skippedCount } = this.categorizeRows(
      sourceRows,
      existingRows,
    );
    stats.skipped = skippedCount;

    if (rowsToCreate.length > 0) {
      const createResult = await this.processBatchCreate(
        api,
        targetRevisionId,
        tableId,
        rowsToCreate,
        batchSize,
        bulkFlags,
        onProgress,
      );
      stats.created = createResult.success;
      stats.createErrors = createResult.errors;
    }

    if (rowsToUpdate.length > 0) {
      const updateResult = await this.processBatchUpdate(
        api,
        targetRevisionId,
        tableId,
        rowsToUpdate,
        batchSize,
        bulkFlags,
        onProgress,
      );
      stats.updated = updateResult.success;
      stats.updateErrors = updateResult.errors;
    }

    return stats;
  }

  async getExistingRows(
    api: ApiClient,
    revisionId: string,
    tableId: string,
    onProgress?: ProgressCallback,
  ): Promise<Map<string, JsonValue>> {
    const existingRows = new Map<string, JsonValue>();
    let after: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const result = await api.rows(revisionId, tableId, {
        first: 100,
        after,
        orderBy: [{ field: 'id', direction: 'asc' }],
      });

      if (result.error || !result.data) {
        break;
      }

      const { edges, pageInfo } = result.data;

      for (const edge of edges) {
        existingRows.set(edge.node.id, edge.node.data as JsonValue);
      }

      onProgress?.({ operation: 'fetch', current: existingRows.size });

      hasMore = pageInfo.hasNextPage;
      after = pageInfo.endCursor;
    }

    return existingRows;
  }

  categorizeRows(
    sourceRows: RowData[],
    existingRows: Map<string, JsonValue>,
  ): {
    rowsToCreate: RowData[];
    rowsToUpdate: RowData[];
    skippedCount: number;
  } {
    const rowsToCreate: RowData[] = [];
    const rowsToUpdate: RowData[] = [];
    let skippedCount = 0;

    for (const row of sourceRows) {
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

  private isDataIdentical(
    newData: Record<string, unknown>,
    existingData: JsonValue,
  ): boolean {
    return objectHash(newData) === objectHash(existingData);
  }

  private async processBatchCreate(
    api: ApiClient,
    revisionId: string,
    tableId: string,
    rows: RowData[],
    batchSize: number,
    bulkFlags: BulkSupportFlags,
    onProgress?: ProgressCallback,
  ): Promise<{ success: number; errors: number }> {
    let success = 0;
    const total = rows.length;

    if (bulkFlags.bulkCreateSupported === false) {
      return this.createRowsSingle(api, revisionId, tableId, rows, onProgress);
    }

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      try {
        const requestData = {
          rows: batch.map((r) => ({ rowId: r.id, data: r.data as object })),
          isRestore: true,
        };

        const result = await api.createRows(revisionId, tableId, requestData);

        if (result.error) {
          if (this.is404Error(result.error)) {
            console.log(
              '    ⚠️ Bulk create not supported, falling back to single-row mode',
            );
            bulkFlags.bulkCreateSupported = false;
            const remainingRows = rows.slice(i);
            return this.createRowsSingle(
              api,
              revisionId,
              tableId,
              remainingRows,
              onProgress,
            );
          }

          const statusCode = this.getErrorStatusCode(result.error);
          throw new RowSyncError(
            `Batch create failed: ${JSON.stringify(result.error)}`,
            tableId,
            statusCode,
            batchSize,
          );
        }

        if (bulkFlags.bulkCreateSupported === undefined) {
          console.log('    ✓ Bulk create supported');
        }
        bulkFlags.bulkCreateSupported = true;
        success += batch.length;
        onProgress?.({ operation: 'create', current: success, total });
      } catch (error: unknown) {
        if (error instanceof RowSyncError) {
          throw error;
        }

        if (this.is404Error(error)) {
          console.log(
            '    ⚠️ Bulk create not supported, falling back to single-row mode',
          );
          bulkFlags.bulkCreateSupported = false;
          const remainingRows = rows.slice(i);
          return this.createRowsSingle(
            api,
            revisionId,
            tableId,
            remainingRows,
            onProgress,
          );
        }

        const statusCode = this.getErrorStatusCode(error);
        throw new RowSyncError(
          `Batch create exception: ${error instanceof Error ? error.message : String(error)}`,
          tableId,
          statusCode,
          batchSize,
        );
      }
    }

    return { success, errors: 0 };
  }

  private async processBatchUpdate(
    api: ApiClient,
    revisionId: string,
    tableId: string,
    rows: RowData[],
    batchSize: number,
    bulkFlags: BulkSupportFlags,
    onProgress?: ProgressCallback,
  ): Promise<{ success: number; errors: number }> {
    let success = 0;
    const total = rows.length;

    if (bulkFlags.bulkUpdateSupported === false) {
      return this.updateRowsSingle(api, revisionId, tableId, rows, onProgress);
    }

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      try {
        const result = await api.updateRows(revisionId, tableId, {
          rows: batch.map((r) => ({ rowId: r.id, data: r.data as object })),
        });

        if (result.error) {
          if (this.is404Error(result.error)) {
            console.log(
              '    ⚠️ Bulk update not supported, falling back to single-row mode',
            );
            bulkFlags.bulkUpdateSupported = false;
            const remainingRows = rows.slice(i);
            return this.updateRowsSingle(
              api,
              revisionId,
              tableId,
              remainingRows,
              onProgress,
            );
          }

          const statusCode = this.getErrorStatusCode(result.error);
          throw new RowSyncError(
            `Batch update failed: ${JSON.stringify(result.error)}`,
            tableId,
            statusCode,
            batchSize,
          );
        }

        if (bulkFlags.bulkUpdateSupported === undefined) {
          console.log('    ✓ Bulk update supported');
        }
        bulkFlags.bulkUpdateSupported = true;
        success += batch.length;
        onProgress?.({ operation: 'update', current: success, total });
      } catch (error: unknown) {
        if (error instanceof RowSyncError) {
          throw error;
        }

        if (this.is404Error(error)) {
          console.log(
            '    ⚠️ Bulk update not supported, falling back to single-row mode',
          );
          bulkFlags.bulkUpdateSupported = false;
          const remainingRows = rows.slice(i);
          return this.updateRowsSingle(
            api,
            revisionId,
            tableId,
            remainingRows,
            onProgress,
          );
        }

        const statusCode = this.getErrorStatusCode(error);
        throw new RowSyncError(
          `Batch update exception: ${error instanceof Error ? error.message : String(error)}`,
          tableId,
          statusCode,
          batchSize,
        );
      }
    }

    return { success, errors: 0 };
  }

  private async createRowsSingle(
    api: ApiClient,
    revisionId: string,
    tableId: string,
    rows: RowData[],
    onProgress?: ProgressCallback,
  ): Promise<{ success: number; errors: number }> {
    let success = 0;
    const total = rows.length;

    for (const row of rows) {
      try {
        const result = await api.createRow(revisionId, tableId, {
          rowId: row.id,
          data: row.data as object,
          isRestore: true,
        });

        if (result.error) {
          const statusCode = this.getErrorStatusCode(result.error);
          throw new RowSyncError(
            `Failed to create row ${row.id}: ${JSON.stringify(result.error)}`,
            tableId,
            statusCode,
          );
        }

        success++;
        onProgress?.({ operation: 'create', current: success, total });
      } catch (error) {
        if (error instanceof RowSyncError) {
          throw error;
        }

        const statusCode = this.getErrorStatusCode(error);
        throw new RowSyncError(
          `Failed to create row ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
          tableId,
          statusCode,
        );
      }
    }

    return { success, errors: 0 };
  }

  private async updateRowsSingle(
    api: ApiClient,
    revisionId: string,
    tableId: string,
    rows: RowData[],
    onProgress?: ProgressCallback,
  ): Promise<{ success: number; errors: number }> {
    let success = 0;
    const total = rows.length;

    for (const row of rows) {
      try {
        const result = await api.updateRow(revisionId, tableId, row.id, {
          data: row.data as object,
        });

        if (result.error) {
          const statusCode = this.getErrorStatusCode(result.error);
          throw new RowSyncError(
            `Failed to update row ${row.id}: ${JSON.stringify(result.error)}`,
            tableId,
            statusCode,
          );
        }

        success++;
        onProgress?.({ operation: 'update', current: success, total });
      } catch (error) {
        if (error instanceof RowSyncError) {
          throw error;
        }

        const statusCode = this.getErrorStatusCode(error);
        throw new RowSyncError(
          `Failed to update row ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
          tableId,
          statusCode,
        );
      }
    }

    return { success, errors: 0 };
  }

  private is404Error(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      return err['statusCode'] === 404 || err['status'] === 404;
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
}
