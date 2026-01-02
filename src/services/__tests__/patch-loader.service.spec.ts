import { PatchLoaderService } from '../patch-loader.service';
import { PatchFile, PatchFileMerged } from '../../types/patch.types';
import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as os from 'os';

describe('PatchLoaderService', () => {
  let service: PatchLoaderService;
  let testDir: string;

  beforeEach(async () => {
    service = new PatchLoaderService();

    testDir = join(os.tmpdir(), `patch-loader-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  describe('loadPatches', () => {
    describe('from file', () => {
      it('loads single PatchFile', async () => {
        const patchFile: PatchFile = {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-14T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'New Title' }],
        };

        const filePath = join(testDir, 'patch.json');
        await writeFile(filePath, JSON.stringify(patchFile), 'utf-8');

        const result = await service.loadPatches(filePath);

        expect(result).toHaveLength(1);
        expect(result[0]).toStrictEqual(patchFile);
      });

      it('loads and splits PatchFileMerged', async () => {
        const mergedFile: PatchFileMerged = {
          version: '1.0',
          table: 'Article',
          createdAt: '2025-10-14T12:00:00Z',
          rows: [
            {
              rowId: 'row-1',
              patches: [{ op: 'replace', path: 'title', value: 'Title 1' }],
            },
            {
              rowId: 'row-2',
              patches: [{ op: 'replace', path: 'title', value: 'Title 2' }],
            },
          ],
        };

        const filePath = join(testDir, 'merged.json');
        await writeFile(filePath, JSON.stringify(mergedFile), 'utf-8');

        const result = await service.loadPatches(filePath);

        expect(result).toHaveLength(2);
        expect(result[0].rowId).toBe('row-1');
        expect(result[1].rowId).toBe('row-2');
        expect(result[0].table).toBe('Article');
        expect(result[1].table).toBe('Article');
      });

      it('throws error for invalid format', async () => {
        const invalidData = {
          invalid: 'format',
        };

        const filePath = join(testDir, 'invalid.json');
        await writeFile(filePath, JSON.stringify(invalidData), 'utf-8');

        await expect(service.loadPatches(filePath)).rejects.toThrow(
          'Invalid patch file format',
        );
      });

      it('throws error for invalid JSON', async () => {
        const filePath = join(testDir, 'invalid.json');
        await writeFile(filePath, 'not json', 'utf-8');

        await expect(service.loadPatches(filePath)).rejects.toThrow();
      });
    });

    describe('from folder', () => {
      it('loads multiple PatchFiles from folder', async () => {
        const patch1: PatchFile = {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-14T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Title 1' }],
        };

        const patch2: PatchFile = {
          version: '1.0',
          table: 'Article',
          rowId: 'row-2',
          createdAt: '2025-10-14T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Title 2' }],
        };

        await writeFile(
          join(testDir, 'patch1.json'),
          JSON.stringify(patch1),
          'utf-8',
        );
        await writeFile(
          join(testDir, 'patch2.json'),
          JSON.stringify(patch2),
          'utf-8',
        );

        const result = await service.loadPatches(testDir);

        expect(result).toHaveLength(2);
        expect(result.map((p) => p.rowId).sort()).toEqual(['row-1', 'row-2']);
      });

      it('loads mixed PatchFile and PatchFileMerged from folder', async () => {
        const patchFile: PatchFile = {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-14T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Title 1' }],
        };

        const mergedFile: PatchFileMerged = {
          version: '1.0',
          table: 'Article',
          createdAt: '2025-10-14T12:00:00Z',
          rows: [
            {
              rowId: 'row-2',
              patches: [{ op: 'replace', path: 'title', value: 'Title 2' }],
            },
            {
              rowId: 'row-3',
              patches: [{ op: 'replace', path: 'title', value: 'Title 3' }],
            },
          ],
        };

        await writeFile(
          join(testDir, 'single.json'),
          JSON.stringify(patchFile),
          'utf-8',
        );
        await writeFile(
          join(testDir, 'merged.json'),
          JSON.stringify(mergedFile),
          'utf-8',
        );

        const result = await service.loadPatches(testDir);

        expect(result).toHaveLength(3);
        expect(result.map((p) => p.rowId).sort()).toEqual([
          'row-1',
          'row-2',
          'row-3',
        ]);
      });

      it('ignores non-JSON files', async () => {
        const patchFile: PatchFile = {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-14T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Title' }],
        };

        await writeFile(
          join(testDir, 'patch.json'),
          JSON.stringify(patchFile),
          'utf-8',
        );
        await writeFile(join(testDir, 'readme.txt'), 'Not JSON', 'utf-8');

        const result = await service.loadPatches(testDir);

        expect(result).toHaveLength(1);
      });

      it('throws error when folder has no JSON files', async () => {
        await writeFile(join(testDir, 'readme.txt'), 'Not JSON', 'utf-8');

        await expect(service.loadPatches(testDir)).rejects.toThrow(
          'No JSON files found',
        );
      });

      it('throws error when file in folder is invalid', async () => {
        await writeFile(join(testDir, 'invalid.json'), 'not json', 'utf-8');

        await expect(service.loadPatches(testDir)).rejects.toThrow(
          'Failed to load patches',
        );
      });
    });
  });

  describe('savePatches', () => {
    describe('separate files', () => {
      it('saves patches as separate files', async () => {
        const patches: PatchFile[] = [
          {
            version: '1.0',
            table: 'Article',
            rowId: 'row-1',
            createdAt: '2025-10-14T12:00:00Z',
            patches: [{ op: 'replace', path: 'title', value: 'Title 1' }],
          },
          {
            version: '1.0',
            table: 'Article',
            rowId: 'row-2',
            createdAt: '2025-10-14T12:00:00Z',
            patches: [{ op: 'replace', path: 'title', value: 'Title 2' }],
          },
        ];

        const outputDir = join(testDir, 'output');
        await service.savePatchesAsSeparateFiles(patches, outputDir);

        const files = await readdir(outputDir);
        expect(files).toHaveLength(2);
        expect(files.sort()).toEqual([
          'Article_row-1.json',
          'Article_row-2.json',
        ]);

        const file1Content = await readFile(
          join(outputDir, 'Article_row-1.json'),
          'utf-8',
        );
        const file1Data = JSON.parse(file1Content) as PatchFile;
        expect(file1Data.rowId).toBe('row-1');
      });

      it('creates output directory if not exists', async () => {
        const patches: PatchFile[] = [
          {
            version: '1.0',
            table: 'Article',
            rowId: 'row-1',
            createdAt: '2025-10-14T12:00:00Z',
            patches: [{ op: 'replace', path: 'title', value: 'Title' }],
          },
        ];

        const outputDir = join(testDir, 'new', 'nested', 'dir');
        await service.savePatchesAsSeparateFiles(patches, outputDir);

        const files = await readdir(outputDir);
        expect(files).toHaveLength(1);
      });
    });

    describe('merged file', () => {
      it('saves patches as merged file for single table', async () => {
        const patches: PatchFile[] = [
          {
            version: '1.0',
            table: 'Article',
            rowId: 'row-1',
            createdAt: '2025-10-14T12:00:00Z',
            patches: [{ op: 'replace', path: 'title', value: 'Title 1' }],
          },
          {
            version: '1.0',
            table: 'Article',
            rowId: 'row-2',
            createdAt: '2025-10-14T12:00:00Z',
            patches: [{ op: 'replace', path: 'title', value: 'Title 2' }],
          },
        ];

        const outputFile = join(testDir, 'merged.json');
        await service.savePatchesAsMergedFile(patches, outputFile);

        const content = await readFile(outputFile, 'utf-8');
        const data = JSON.parse(content) as PatchFileMerged;

        expect(data.version).toBe('1.0');
        expect(data.table).toBe('Article');
        expect(data.rows).toHaveLength(2);
        expect(data.rows[0].rowId).toBe('row-1');
        expect(data.rows[1].rowId).toBe('row-2');
      });

      it('saves patches as separate merged files for multiple tables', async () => {
        const patches: PatchFile[] = [
          {
            version: '1.0',
            table: 'Article',
            rowId: 'row-1',
            createdAt: '2025-10-14T12:00:00Z',
            patches: [{ op: 'replace', path: 'title', value: 'Title 1' }],
          },
          {
            version: '1.0',
            table: 'Author',
            rowId: 'row-2',
            createdAt: '2025-10-14T12:00:00Z',
            patches: [{ op: 'replace', path: 'name', value: 'Name 1' }],
          },
        ];

        const outputFile = join(testDir, 'merged.json');
        await service.savePatchesAsMergedFile(patches, outputFile);

        // Should create two files: merged_Article.json and merged_Author.json
        const files = await readdir(testDir);
        expect(files.sort()).toEqual([
          'merged_Article.json',
          'merged_Author.json',
        ]);

        const articleContent = await readFile(
          join(testDir, 'merged_Article.json'),
          'utf-8',
        );
        const articleData = JSON.parse(articleContent) as PatchFileMerged;
        expect(articleData.table).toBe('Article');
        expect(articleData.rows).toHaveLength(1);

        const authorContent = await readFile(
          join(testDir, 'merged_Author.json'),
          'utf-8',
        );
        const authorData = JSON.parse(authorContent) as PatchFileMerged;
        expect(authorData.table).toBe('Author');
        expect(authorData.rows).toHaveLength(1);
      });

      it('creates parent directory if not exists', async () => {
        const patches: PatchFile[] = [
          {
            version: '1.0',
            table: 'Article',
            rowId: 'row-1',
            createdAt: '2025-10-14T12:00:00Z',
            patches: [{ op: 'replace', path: 'title', value: 'Title' }],
          },
        ];

        const outputFile = join(testDir, 'new', 'nested', 'merged.json');
        await service.savePatchesAsMergedFile(patches, outputFile);

        const content = await readFile(outputFile, 'utf-8');
        const data = JSON.parse(content) as PatchFileMerged;
        expect(data.table).toBe('Article');
      });
    });
  });

  describe('round-trip', () => {
    it('loads and saves patches without data loss (separate files)', async () => {
      const originalPatches: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-14T12:00:00Z',
          patches: [
            { op: 'replace', path: 'title', value: 'Title 1' },
            { op: 'add', path: 'tags[0]', value: 'tag1' },
          ],
        },
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-2',
          createdAt: '2025-10-14T12:00:00Z',
          patches: [{ op: 'remove', path: 'oldField' }],
        },
      ];

      const outputDir = join(testDir, 'output');
      await service.savePatchesAsSeparateFiles(originalPatches, outputDir);

      const loadedPatches = await service.loadPatches(outputDir);

      expect(loadedPatches).toHaveLength(2);
      expect(
        loadedPatches.sort((a, b) => a.rowId.localeCompare(b.rowId)),
      ).toStrictEqual(
        originalPatches.sort((a, b) => a.rowId.localeCompare(b.rowId)),
      );
    });

    it('loads and saves patches without data loss (merged file)', async () => {
      const originalPatches: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-14T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Title 1' }],
        },
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-2',
          createdAt: '2025-10-14T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Title 2' }],
        },
      ];

      const outputFile = join(testDir, 'merged.json');
      await service.savePatchesAsMergedFile(originalPatches, outputFile);

      const loadedPatches = await service.loadPatches(outputFile);

      expect(loadedPatches).toHaveLength(2);
      expect(loadedPatches.map((p) => p.rowId).sort()).toEqual([
        'row-1',
        'row-2',
      ]);
      expect(loadedPatches.map((p) => p.table)).toEqual(['Article', 'Article']);
    });
  });
});
