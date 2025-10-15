import { Injectable } from '@nestjs/common';
import { CoreApiService } from './core-api.service';
import { getValueByPath, deepEqual } from '@revisium/schema-toolkit/lib';
import {
  PatchFile,
  DiffResult,
  RowDiff,
  PatchDiff,
} from '../types/patch.types';

@Injectable()
export class PatchDiffService {
  constructor(private readonly coreApi: CoreApiService) {}

  public async compareWithApi(
    patches: PatchFile[],
    revisionId: string,
  ): Promise<DiffResult> {
    if (patches.length === 0) {
      throw new Error('No patches provided');
    }

    const table = patches[0].table;

    if (!patches.every((p) => p.table === table)) {
      throw new Error('All patches must be from the same table');
    }

    const rowDiffs: RowDiff[] = [];
    let totalChanges = 0;
    let skipped = 0;
    let errors = 0;

    for (const patchFile of patches) {
      try {
        const currentRow = await this.loadRow(
          revisionId,
          table,
          patchFile.rowId,
        );

        if (!currentRow) {
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
      } catch (error) {
        rowDiffs.push({
          rowId: patchFile.rowId,
          patches: [
            {
              path: '',
              currentValue: null,
              newValue: null,
              op: 'error',
              status: 'ERROR',
              error: `Failed to load row: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        });
        errors++;
      }
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

  private async loadRow(
    revisionId: string,
    tableId: string,
    rowId: string,
  ): Promise<unknown> {
    const response = await this.coreApi.api.row(revisionId, tableId, rowId);

    if (response.error) {
      throw new Error(`Failed to fetch row: ${JSON.stringify(response.error)}`);
    }

    if (!response.data) {
      return null;
    }

    return (response.data as { data?: unknown }).data ?? null;
  }
}
