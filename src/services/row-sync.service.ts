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

import { RowSyncError } from 'src/types/errors';
export { RowSyncError } from 'src/types/errors';

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
    data: { rows: { rowId: string; data: object }[]; isRestore?: boolean },
  ): Promise<{ data?: unknown; error?: unknown }>;
}

import type { ProgressState, ProgressOperation } from 'src/utils/progress';

export type { ProgressState, ProgressOperation } from 'src/utils/progress';

export type ProgressCallback = (state: ProgressState) => void;

const DEFAULT_BATCH_SIZE = 100;

@Injectable()
export class RowSyncService {
  async syncTableRows(
    api: ApiClient,
    targetRevisionId: string,
    tableId: string,
    sourceRows: RowData[],
    batchSize: number = DEFAULT_BATCH_SIZE,
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
      } else if (this.isDataIdentical(row.data, existingData)) {
        skippedCount++;
      } else {
        rowsToUpdate.push(row);
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
    onProgress?: ProgressCallback,
  ): Promise<{ success: number; errors: number }> {
    return this.processBatches({
      rows,
      batchSize,
      tableId,
      operation: 'create',
      onProgress,
      executeBatch: (batch) =>
        api.createRows(revisionId, tableId, {
          rows: batch.map((r) => ({ rowId: r.id, data: r.data as object })),
          isRestore: true,
        }),
      operationName: 'create',
    });
  }

  private async processBatchUpdate(
    api: ApiClient,
    revisionId: string,
    tableId: string,
    rows: RowData[],
    batchSize: number,
    onProgress?: ProgressCallback,
  ): Promise<{ success: number; errors: number }> {
    return this.processBatches({
      rows,
      batchSize,
      tableId,
      operation: 'update',
      onProgress,
      executeBatch: (batch) =>
        api.updateRows(revisionId, tableId, {
          rows: batch.map((r) => ({ rowId: r.id, data: r.data as object })),
          isRestore: true,
        }),
      operationName: 'update',
    });
  }

  private async processBatches(config: {
    rows: RowData[];
    batchSize: number;
    tableId: string;
    operation: ProgressOperation;
    onProgress?: ProgressCallback;
    executeBatch: (
      batch: RowData[],
    ) => Promise<{ data?: unknown; error?: unknown }>;
    operationName: string;
  }): Promise<{ success: number; errors: number }> {
    let success = 0;
    const { rows, batchSize, tableId, operation, onProgress } = config;
    const total = rows.length;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      try {
        const result = await config.executeBatch(batch);

        if (result.error) {
          const statusCode = this.getErrorStatusCode(result.error);
          throw new RowSyncError(
            `Batch ${config.operationName} failed: ${JSON.stringify(result.error)}`,
            tableId,
            statusCode,
            batchSize,
          );
        }

        success += batch.length;
        onProgress?.({ operation, current: success, total });
      } catch (error: unknown) {
        if (error instanceof RowSyncError) {
          throw error;
        }

        const statusCode = this.getErrorStatusCode(error);
        throw new RowSyncError(
          `Batch ${config.operationName} exception: ${error instanceof Error ? error.message : String(error)}`,
          tableId,
          statusCode,
          batchSize,
        );
      }
    }

    return { success, errors: 0 };
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
