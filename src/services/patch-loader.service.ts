import { Injectable } from '@nestjs/common';
import { readFile, readdir, stat, writeFile, mkdir } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { PatchFile, PatchFileMerged } from '../types/patch.types';

@Injectable()
export class PatchLoaderService {
  async loadPatches(inputPath: string): Promise<PatchFile[]> {
    const stats = await stat(inputPath);

    if (stats.isDirectory()) {
      return this.loadFromFolder(inputPath);
    } else {
      return this.loadFromFile(inputPath);
    }
  }

  private async loadFromFile(filePath: string): Promise<PatchFile[]> {
    const content = await readFile(filePath, 'utf-8');
    const data: unknown = JSON.parse(content);

    if (this.isPatchFileMerged(data)) {
      return this.splitMergedFile(data);
    } else if (this.isPatchFile(data)) {
      return [data];
    } else {
      throw new Error(
        `Invalid patch file format in ${filePath}. Expected PatchFile or PatchFileMerged.`,
      );
    }
  }

  private async loadFromFolder(folderPath: string): Promise<PatchFile[]> {
    const files = await readdir(folderPath);
    const jsonFiles = files.filter((f) => extname(f) === '.json');

    if (jsonFiles.length === 0) {
      throw new Error(`No JSON files found in ${folderPath}`);
    }

    const patches: PatchFile[] = [];

    for (const file of jsonFiles) {
      const filePath = join(folderPath, file);
      try {
        const filePatchesList = await this.loadFromFile(filePath);
        patches.push(...filePatchesList);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to load patches from ${filePath}: ${errorMessage}`,
        );
      }
    }

    return patches;
  }

  async savePatches(
    patches: PatchFile[],
    outputPath: string,
    merge: boolean,
  ): Promise<void> {
    if (merge) {
      await this.saveMergedFile(patches, outputPath);
    } else {
      await this.saveSeparateFiles(patches, outputPath);
    }
  }

  private async saveSeparateFiles(
    patches: PatchFile[],
    folderPath: string,
  ): Promise<void> {
    await mkdir(folderPath, { recursive: true });

    for (const patch of patches) {
      const fileName = `${patch.table}_${patch.rowId}.json`;
      const filePath = join(folderPath, fileName);
      const content = JSON.stringify(patch, null, 2);
      await writeFile(filePath, content, 'utf-8');
    }
  }

  private async saveMergedFile(
    patches: PatchFile[],
    filePath: string,
  ): Promise<void> {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });

    const patchesByTable = this.groupByTable(patches);

    const tables = Object.keys(patchesByTable);

    if (tables.length === 1) {
      const table = tables[0];
      const tablePatchesList = patchesByTable[table];
      const merged = this.createMergedFile(table, tablePatchesList);
      const content = JSON.stringify(merged, null, 2);
      await writeFile(filePath, content, 'utf-8');
    } else {
      const ext = extname(filePath);
      const baseName = filePath.slice(0, -ext.length);

      for (const table of tables) {
        const tablePatchesList = patchesByTable[table];
        const merged = this.createMergedFile(table, tablePatchesList);
        const tableFilePath = `${baseName}_${table}${ext}`;
        const content = JSON.stringify(merged, null, 2);
        await writeFile(tableFilePath, content, 'utf-8');
      }
    }
  }

  private groupByTable(patches: PatchFile[]): Record<string, PatchFile[]> {
    const grouped: Record<string, PatchFile[]> = {};

    for (const patch of patches) {
      if (!grouped[patch.table]) {
        grouped[patch.table] = [];
      }
      grouped[patch.table].push(patch);
    }

    return grouped;
  }

  private createMergedFile(
    table: string,
    patches: PatchFile[],
  ): PatchFileMerged {
    return {
      version: '1.0',
      table,
      createdAt: new Date().toISOString(),
      rows: patches.map((p) => ({
        rowId: p.rowId,
        patches: p.patches,
      })),
    };
  }

  private splitMergedFile(merged: PatchFileMerged): PatchFile[] {
    return merged.rows.map((row) => ({
      version: '1.0',
      table: merged.table,
      rowId: row.rowId,
      createdAt: merged.createdAt,
      patches: row.patches,
    }));
  }

  private isPatchFile(data: unknown): data is PatchFile {
    return (
      typeof data === 'object' &&
      data !== null &&
      'version' in data &&
      'table' in data &&
      'rowId' in data &&
      'patches' in data
    );
  }

  private isPatchFileMerged(data: unknown): data is PatchFileMerged {
    return (
      typeof data === 'object' &&
      data !== null &&
      'version' in data &&
      'table' in data &&
      'rows' in data &&
      Array.isArray((data as PatchFileMerged).rows)
    );
  }
}
