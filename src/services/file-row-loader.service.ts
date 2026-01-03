import { Injectable } from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JsonValue } from 'src/types/json.types';
import { RowData } from './row-sync.service';

export interface LoadResult {
  rows: RowData[];
  totalFiles: number;
  invalidCount: number;
  parseErrors: number;
}

@Injectable()
export class FileRowLoaderService {
  async getTableIds(
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

  async loadTableRows(
    folderPath: string,
    tableId: string,
    validator?: (data: JsonValue) => boolean,
  ): Promise<LoadResult> {
    const tableFolderPath = join(folderPath, tableId);
    const rowFiles = await readdir(tableFolderPath);
    const jsonFiles = rowFiles.filter((file) => file.endsWith('.json'));

    const result: LoadResult = {
      rows: [],
      totalFiles: jsonFiles.length,
      invalidCount: 0,
      parseErrors: 0,
    };

    for (const fileName of jsonFiles) {
      const filePath = join(tableFolderPath, fileName);
      try {
        const fileContent = await readFile(filePath, 'utf-8');
        const rowData = JSON.parse(fileContent) as {
          id: string;
          data: Record<string, unknown>;
        };

        if (validator && !validator(rowData.data as JsonValue)) {
          result.invalidCount++;
          continue;
        }

        result.rows.push({
          id: rowData.id,
          data: rowData.data,
        });
      } catch {
        result.parseErrors++;
      }
    }

    return result;
  }
}
