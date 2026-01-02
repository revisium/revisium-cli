import { Injectable } from '@nestjs/common';
import { CoreApiService } from './core-api.service';
import { getValueByPath, deepEqual } from '@revisium/schema-toolkit/lib';
import { JsonValue, JsonValuePatch } from '@revisium/schema-toolkit/types';
import {
  PatchFile,
  DiffResult,
  RowDiff,
  PatchDiff,
} from '../types/patch.types';

const BATCH_SIZE = 100;

export type CompareProgressCallback = (current: number, total: number) => void;

interface RowData {
  id: string;
  data: unknown;
}

interface CompareStats {
  totalChanges: number;
  skipped: number;
  errors: number;
}

@Injectable()
export class PatchDiffService {
  constructor(private readonly coreApi: CoreApiService) {}

  public async compareWithApi(
    patches: PatchFile[],
    revisionId: string,
    onProgress?: CompareProgressCallback,
  ): Promise<DiffResult> {
    this.validatePatches(patches);

    const table = patches[0].table;
    const rowIds = patches.map((p) => p.rowId);
    const rowsMap = await this.loadRowsBatch(
      revisionId,
      table,
      rowIds,
      onProgress,
    );

    const stats: CompareStats = { totalChanges: 0, skipped: 0, errors: 0 };
    const rowDiffs = patches.map((patchFile) =>
      this.processPatchFile(patchFile, rowsMap, stats),
    );

    return {
      table,
      rows: rowDiffs,
      summary: {
        totalRows: patches.length,
        totalChanges: stats.totalChanges,
        skipped: stats.skipped,
        errors: stats.errors,
      },
    };
  }

  private validatePatches(patches: PatchFile[]): void {
    if (patches.length === 0) {
      throw new Error('No patches provided');
    }

    const table = patches[0].table;
    if (!patches.every((p) => p.table === table)) {
      throw new Error('All patches must be from the same table');
    }
  }

  private processPatchFile(
    patchFile: PatchFile,
    rowsMap: Map<string, JsonValue>,
    stats: CompareStats,
  ): RowDiff {
    const currentRow = rowsMap.get(patchFile.rowId);

    if (currentRow === undefined) {
      stats.errors++;
      return this.createRowNotFoundDiff(patchFile.rowId);
    }

    const patchDiffs = patchFile.patches.map((patch) =>
      this.comparePatch(patch, currentRow, stats),
    );

    return {
      rowId: patchFile.rowId,
      patches: patchDiffs,
    };
  }

  private createRowNotFoundDiff(rowId: string): RowDiff {
    return {
      rowId,
      patches: [
        {
          path: '',
          currentValue: null,
          newValue: null,
          op: 'error',
          status: 'ERROR',
          error: 'Row not found in API',
        },
      ],
    };
  }

  private comparePatch(
    patch: JsonValuePatch,
    currentRow: JsonValue,
    stats: CompareStats,
  ): PatchDiff {
    try {
      return this.createPatchDiff(patch, currentRow, stats);
    } catch (error) {
      stats.errors++;
      return this.createErrorPatchDiff(patch, error);
    }
  }

  private createPatchDiff(
    patch: JsonValuePatch,
    currentRow: JsonValue,
    stats: CompareStats,
  ): PatchDiff {
    const currentValue = getValueByPath(currentRow, patch.path);
    const newValue = (patch as { value?: unknown }).value;
    const isEqual = deepEqual(currentValue, newValue);

    if (isEqual) {
      stats.skipped++;
    } else {
      stats.totalChanges++;
    }

    return {
      path: patch.path,
      currentValue,
      newValue,
      op: patch.op,
      status: isEqual ? 'SKIP' : 'CHANGE',
    };
  }

  private createErrorPatchDiff(
    patch: JsonValuePatch,
    error: unknown,
  ): PatchDiff {
    return {
      path: patch.path,
      currentValue: null,
      newValue: (patch as { value?: unknown }).value ?? null,
      op: patch.op,
      status: 'ERROR',
      error: `Failed to get value: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  private async loadRowsBatch(
    revisionId: string,
    tableId: string,
    rowIds: string[],
    onProgress?: CompareProgressCallback,
  ): Promise<Map<string, JsonValue>> {
    const rowsMap = new Map<string, JsonValue>();

    for (let i = 0; i < rowIds.length; i += BATCH_SIZE) {
      const batchIds = rowIds.slice(i, i + BATCH_SIZE);

      if (onProgress) {
        onProgress(i, rowIds.length);
      }

      const response = await this.coreApi.api.rows(revisionId, tableId, {
        first: BATCH_SIZE,
        where: {
          id: {
            in: batchIds,
          },
        },
      });

      if (response.error) {
        throw new Error(
          `Failed to fetch rows: ${JSON.stringify(response.error)}`,
        );
      }

      if (response.data?.edges) {
        for (const edge of response.data.edges) {
          const row = edge.node as RowData;
          rowsMap.set(row.id, row.data as JsonValue);
        }
      }
    }

    if (onProgress) {
      onProgress(rowIds.length, rowIds.length);
    }

    return rowsMap;
  }
}
