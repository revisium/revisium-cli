import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileRowLoaderService } from '../file-row-loader.service';

describe('FileRowLoaderService', () => {
  let service: FileRowLoaderService;
  let testDir: string;

  beforeEach(async () => {
    service = new FileRowLoaderService();
    testDir = join(tmpdir(), `file-row-loader-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('getTableIds', () => {
    it('returns filtered tables when filter provided', async () => {
      const result = await service.getTableIds(
        testDir,
        'users,orders,products',
      );

      expect(result).toEqual(['users', 'orders', 'products']);
    });

    it('returns directory names when no filter', async () => {
      await mkdir(join(testDir, 'table_a'));
      await mkdir(join(testDir, 'table_b'));
      await writeFile(join(testDir, 'file.txt'), 'content');

      const result = await service.getTableIds(testDir);

      expect(result.sort()).toEqual(['table_a', 'table_b']);
    });

    it('returns empty array for empty directory', async () => {
      const result = await service.getTableIds(testDir);

      expect(result).toEqual([]);
    });
  });

  describe('loadTableRows', () => {
    it('loads all valid JSON files from table folder', async () => {
      const tableDir = join(testDir, 'users');
      await mkdir(tableDir);

      await writeFile(
        join(tableDir, 'row1.json'),
        JSON.stringify({ id: 'row1', data: { name: 'Alice' } }),
      );
      await writeFile(
        join(tableDir, 'row2.json'),
        JSON.stringify({ id: 'row2', data: { name: 'Bob' } }),
      );

      const result = await service.loadTableRows(testDir, 'users');

      expect(result.totalFiles).toBe(2);
      expect(result.rows).toHaveLength(2);
      expect(result.invalidCount).toBe(0);
      expect(result.parseErrors).toBe(0);
    });

    it('ignores non-JSON files', async () => {
      const tableDir = join(testDir, 'items');
      await mkdir(tableDir);

      await writeFile(
        join(tableDir, 'row1.json'),
        JSON.stringify({ id: 'row1', data: { name: 'Item' } }),
      );
      await writeFile(join(tableDir, 'readme.txt'), 'Not a JSON file');

      const result = await service.loadTableRows(testDir, 'items');

      expect(result.totalFiles).toBe(1);
      expect(result.rows).toHaveLength(1);
    });

    it('counts parse errors for invalid JSON', async () => {
      const tableDir = join(testDir, 'data');
      await mkdir(tableDir);

      await writeFile(
        join(tableDir, 'valid.json'),
        JSON.stringify({ id: 'valid', data: { x: 1 } }),
      );
      await writeFile(join(tableDir, 'invalid.json'), '{ broken json');

      const result = await service.loadTableRows(testDir, 'data');

      expect(result.totalFiles).toBe(2);
      expect(result.rows).toHaveLength(1);
      expect(result.parseErrors).toBe(1);
    });

    it('validates rows with provided validator', async () => {
      const tableDir = join(testDir, 'validated');
      await mkdir(tableDir);

      await writeFile(
        join(tableDir, 'valid.json'),
        JSON.stringify({ id: 'valid', data: { count: 10 } }),
      );
      await writeFile(
        join(tableDir, 'invalid.json'),
        JSON.stringify({ id: 'invalid', data: { count: -1 } }),
      );

      const validator = (data: unknown) => {
        const d = data as { count: number };
        return d.count >= 0;
      };

      const result = await service.loadTableRows(
        testDir,
        'validated',
        validator,
      );

      expect(result.totalFiles).toBe(2);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe('valid');
      expect(result.invalidCount).toBe(1);
    });

    it('loads all rows when no validator provided', async () => {
      const tableDir = join(testDir, 'novalidation');
      await mkdir(tableDir);

      await writeFile(
        join(tableDir, 'row.json'),
        JSON.stringify({ id: 'row', data: { any: 'data' } }),
      );

      const result = await service.loadTableRows(testDir, 'novalidation');

      expect(result.rows).toHaveLength(1);
      expect(result.invalidCount).toBe(0);
    });

    it('returns empty result for empty table folder', async () => {
      const tableDir = join(testDir, 'empty');
      await mkdir(tableDir);

      const result = await service.loadTableRows(testDir, 'empty');

      expect(result.totalFiles).toBe(0);
      expect(result.rows).toHaveLength(0);
    });
  });
});
