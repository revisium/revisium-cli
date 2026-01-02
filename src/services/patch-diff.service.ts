import { Injectable } from '@nestjs/common';
import { CoreApiService } from './core-api.service';
import { getValueByPath, deepEqual } from '@revisium/schema-toolkit/lib';
import {
  PatchFile,
  DiffResult,
  RowDiff,
  PatchDiff,
} from '../types/patch.types';

const BATCH_SIZE = 100;

export interface CompareProgressCallback {
  (current: number, total: number): void;
}

interface RowData {
  id: string;
  data: unknown;
}

@Injectable()
export class PatchDiffService {
  constructor(private readonly coreApi: CoreApiService) {}

  public async compareWithApi(
    patches: PatchFile[],
    revisionId: string,
    onProgress?: CompareProgressCallback,
  ): Promise<DiffResult> {
    if (patches.length === 0) {
      throw new Error('No patches provided');
    }

    const table = patches[0].table;

    if (!patches.every((p) => p.table === table)) {
      throw new Error('All patches must be from the same table');
    }

    const rowIds = patches.map((p) => p.rowId);
    const rowsMap = await this.loadRowsBatch(
      revisionId,
      table,
      rowIds,
      onProgress,
    );

    const rowDiffs: RowDiff[] = [];
    let totalChanges = 0;
    let skipped = 0;
    let errors = 0;

    for (const patchFile of patches) {
      const currentRow = rowsMap.get(patchFile.rowId);

      if (currentRow === undefined) {
        rowDiffs.push({
          rowId: patchFile.rowId,
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
        });
        errors++;
        continue;
      }

      const patchDiffs: PatchDiff[] = [];

      for (const patch of patchFile.patches) {
        try {
          const currentValue = getValueByPath(currentRow, patch.path);
          const newValue = (patch as { value?: unknown }).value;

          let status: 'CHANGE' | 'SKIP' | 'ERROR';

          if (deepEqual(currentValue, newValue)) {
            status = 'SKIP';
            skipped++;
          } else {
            status = 'CHANGE';
            totalChanges++;
          }

          patchDiffs.push({
            path: patch.path,
            currentValue,
            newValue,
            op: patch.op,
            status,
          });
        } catch (error) {
          patchDiffs.push({
            path: patch.path,
            currentValue: null,
            newValue: (patch as { value?: unknown }).value ?? null,
            op: patch.op,
            status: 'ERROR',
            error: `Failed to get value: ${error instanceof Error ? error.message : String(error)}`,
          });
          errors++;
        }
      }

      rowDiffs.push({
        rowId: patchFile.rowId,
        patches: patchDiffs,
      });
    }

    return {
      table,
      rows: rowDiffs,
      summary: {
        totalRows: patches.length,
        totalChanges,
        skipped,
        errors,
      },
    };
  }

  private async loadRowsBatch(
    revisionId: string,
    tableId: string,
    rowIds: string[],
    onProgress?: CompareProgressCallback,
  ): Promise<Map<string, unknown>> {
    const rowsMap = new Map<string, unknown>();

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
          rowsMap.set(row.id, row.data);
        }
      }
    }

    if (onProgress) {
      onProgress(rowIds.length, rowIds.length);
    }

    return rowsMap;
  }
}
