import { Test, TestingModule } from '@nestjs/testing';
import { PatchDiffService } from '../patch-diff.service';
import { CoreApiService } from '../core-api.service';
import { PatchFile } from '../../types/patch.types';

describe('PatchDiffService', () => {
  let service: PatchDiffService;
  let coreApiService: jest.Mocked<CoreApiService>;

  beforeEach(async () => {
    const mockCoreApi = {
      api: {
        row: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatchDiffService,
        {
          provide: CoreApiService,
          useValue: mockCoreApi,
        },
      ],
    }).compile();

    service = module.get<PatchDiffService>(PatchDiffService);
    coreApiService = module.get(CoreApiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('compareWithApi', () => {
    it('compares patches with API data and identifies changes', async () => {
      const patches: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-15T12:00:00Z',
          patches: [
            { op: 'replace', path: 'title', value: 'New Title' },
            { op: 'replace', path: 'status', value: 'published' },
          ],
        },
      ];

      (coreApiService.api.row as jest.Mock).mockResolvedValue({
        data: {
          data: {
            title: 'Old Title',
            status: 'published',
          },
        },
        error: null,
      });

      const result = await service.compareWithApi(patches, 'revision-123');

      expect(result.table).toBe('Article');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].rowId).toBe('row-1');
      expect(result.rows[0].patches).toHaveLength(2);

      const titlePatch = result.rows[0].patches.find((p) => p.path === 'title');
      expect(titlePatch?.status).toBe('CHANGE');
      expect(titlePatch?.currentValue).toBe('Old Title');
      expect(titlePatch?.newValue).toBe('New Title');

      const statusPatch = result.rows[0].patches.find(
        (p) => p.path === 'status',
      );
      expect(statusPatch?.status).toBe('SKIP');
      expect(statusPatch?.currentValue).toBe('published');
      expect(statusPatch?.newValue).toBe('published');

      expect(result.summary.totalRows).toBe(1);
      expect(result.summary.totalChanges).toBe(1);
      expect(result.summary.skipped).toBe(1);
      expect(result.summary.errors).toBe(0);
    });

    it('identifies all changes when values differ', async () => {
      const patches: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-15T12:00:00Z',
          patches: [
            { op: 'replace', path: 'title', value: 'New Title' },
            { op: 'replace', path: 'count', value: 42 },
          ],
        },
      ];

      (coreApiService.api.row as jest.Mock).mockResolvedValue({
        data: {
          data: {
            title: 'Old Title',
            count: 10,
          },
        },
        error: null,
      });

      const result = await service.compareWithApi(patches, 'revision-123');

      expect(result.summary.totalChanges).toBe(2);
      expect(result.summary.skipped).toBe(0);
      expect(result.summary.errors).toBe(0);
    });

    it('skips patches when values are equal', async () => {
      const patches: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-15T12:00:00Z',
          patches: [
            { op: 'replace', path: 'title', value: 'Same Title' },
            { op: 'replace', path: 'count', value: 42 },
          ],
        },
      ];

      (coreApiService.api.row as jest.Mock).mockResolvedValue({
        data: {
          data: {
            title: 'Same Title',
            count: 42,
          },
        },
        error: null,
      });

      const result = await service.compareWithApi(patches, 'revision-123');

      expect(result.summary.totalChanges).toBe(0);
      expect(result.summary.skipped).toBe(2);
      expect(result.summary.errors).toBe(0);
    });

    it('handles nested object paths correctly', async () => {
      const patches: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-15T12:00:00Z',
          patches: [
            { op: 'replace', path: 'metadata.author', value: 'John Doe' },
            { op: 'replace', path: 'metadata.version', value: 2 },
          ],
        },
      ];

      (coreApiService.api.row as jest.Mock).mockResolvedValue({
        data: {
          data: {
            metadata: {
              author: 'Jane Doe',
              version: 2,
            },
          },
        },
        error: null,
      });

      const result = await service.compareWithApi(patches, 'revision-123');

      const authorPatch = result.rows[0].patches.find(
        (p) => p.path === 'metadata.author',
      );
      expect(authorPatch?.status).toBe('CHANGE');
      expect(authorPatch?.currentValue).toBe('Jane Doe');
      expect(authorPatch?.newValue).toBe('John Doe');

      const versionPatch = result.rows[0].patches.find(
        (p) => p.path === 'metadata.version',
      );
      expect(versionPatch?.status).toBe('SKIP');

      expect(result.summary.totalChanges).toBe(1);
      expect(result.summary.skipped).toBe(1);
    });

    it('handles array paths correctly', async () => {
      const patches: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-15T12:00:00Z',
          patches: [{ op: 'replace', path: 'tags[0]', value: 'new-tag' }],
        },
      ];

      (coreApiService.api.row as jest.Mock).mockResolvedValue({
        data: {
          data: {
            tags: ['old-tag', 'tag2'],
          },
        },
        error: null,
      });

      const result = await service.compareWithApi(patches, 'revision-123');

      expect(result.rows[0].patches[0].status).toBe('CHANGE');
      expect(result.rows[0].patches[0].currentValue).toBe('old-tag');
      expect(result.rows[0].patches[0].newValue).toBe('new-tag');
    });

    it('handles row not found error', async () => {
      const patches: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-15T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Title' }],
        },
      ];

      (coreApiService.api.row as jest.Mock).mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await service.compareWithApi(patches, 'revision-123');

      expect(result.summary.errors).toBe(1);
      expect(result.rows[0].patches[0].status).toBe('ERROR');
      expect(result.rows[0].patches[0].error).toBe('Row not found in API');
    });

    it('handles API errors gracefully', async () => {
      const patches: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-15T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Title' }],
        },
      ];

      (coreApiService.api.row as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      const result = await service.compareWithApi(patches, 'revision-123');

      expect(result.summary.errors).toBe(1);
      expect(result.rows[0].patches[0].status).toBe('ERROR');
      expect(result.rows[0].patches[0].error).toContain('Failed to fetch row');
    });

    it('handles multiple rows correctly', async () => {
      const patches: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-15T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Title 1' }],
        },
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-2',
          createdAt: '2025-10-15T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Title 2' }],
        },
      ];

      (coreApiService.api.row as jest.Mock)
        .mockResolvedValueOnce({
          data: { data: { title: 'Old Title 1' } },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { data: { title: 'Old Title 2' } },
          error: null,
        });

      const result = await service.compareWithApi(patches, 'revision-123');

      expect(result.rows).toHaveLength(2);
      expect(result.summary.totalRows).toBe(2);
      expect(result.summary.totalChanges).toBe(2);
    });

    it('handles path access for non-existent paths', async () => {
      const patches: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-15T12:00:00Z',
          patches: [
            { op: 'replace', path: 'deeply.nested.invalid.path', value: 'val' },
          ],
        },
      ];

      (coreApiService.api.row as jest.Mock).mockResolvedValue({
        data: { data: { title: 'Title' } },
        error: null,
      });

      const result = await service.compareWithApi(patches, 'revision-123');

      expect(result.rows[0].patches[0].status).toBe('CHANGE');
      expect(result.rows[0].patches[0].currentValue).toBeUndefined();
      expect(result.rows[0].patches[0].newValue).toBe('val');
    });

    it('throws error for empty patches array', async () => {
      await expect(service.compareWithApi([], 'revision-123')).rejects.toThrow(
        'No patches provided',
      );
    });

    it('throws error for patches from different tables', async () => {
      const patches: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-15T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Title' }],
        },
        {
          version: '1.0',
          table: 'User',
          rowId: 'row-2',
          createdAt: '2025-10-15T12:00:00Z',
          patches: [{ op: 'replace', path: 'name', value: 'Name' }],
        },
      ];

      await expect(
        service.compareWithApi(patches, 'revision-123'),
      ).rejects.toThrow('All patches must be from the same table');
    });
  });

  describe('getChangesOnly', () => {
    it('filters out skipped patches', () => {
      const diff = {
        table: 'Article',
        rows: [
          {
            rowId: 'row-1',
            patches: [
              {
                path: 'title',
                currentValue: 'Old',
                newValue: 'New',
                op: 'replace',
                status: 'CHANGE' as const,
              },
              {
                path: 'status',
                currentValue: 'published',
                newValue: 'published',
                op: 'replace',
                status: 'SKIP' as const,
              },
            ],
          },
        ],
        summary: {
          totalRows: 1,
          totalChanges: 1,
          skipped: 1,
          errors: 0,
        },
      };

      const result = service.getChangesOnly(diff);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].patches).toHaveLength(1);
      expect(result.rows[0].patches[0].path).toBe('title');
      expect(result.summary.totalChanges).toBe(1);
    });

    it('removes rows with no changes', () => {
      const diff = {
        table: 'Article',
        rows: [
          {
            rowId: 'row-1',
            patches: [
              {
                path: 'title',
                currentValue: 'Same',
                newValue: 'Same',
                op: 'replace',
                status: 'SKIP' as const,
              },
            ],
          },
          {
            rowId: 'row-2',
            patches: [
              {
                path: 'title',
                currentValue: 'Old',
                newValue: 'New',
                op: 'replace',
                status: 'CHANGE' as const,
              },
            ],
          },
        ],
        summary: {
          totalRows: 2,
          totalChanges: 1,
          skipped: 1,
          errors: 0,
        },
      };

      const result = service.getChangesOnly(diff);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].rowId).toBe('row-2');
      expect(result.summary.totalRows).toBe(1);
    });

    it('preserves error patches', () => {
      const diff = {
        table: 'Article',
        rows: [
          {
            rowId: 'row-1',
            patches: [
              {
                path: 'title',
                currentValue: null,
                newValue: 'New',
                op: 'replace',
                status: 'ERROR' as const,
                error: 'Path not found',
              },
            ],
          },
        ],
        summary: {
          totalRows: 1,
          totalChanges: 0,
          skipped: 0,
          errors: 1,
        },
      };

      const result = service.getChangesOnly(diff);

      expect(result.rows).toHaveLength(0);
    });

    it('handles empty diff', () => {
      const diff = {
        table: 'Article',
        rows: [],
        summary: {
          totalRows: 0,
          totalChanges: 0,
          skipped: 0,
          errors: 0,
        },
      };

      const result = service.getChangesOnly(diff);

      expect(result.rows).toHaveLength(0);
      expect(result.summary.totalRows).toBe(0);
      expect(result.summary.totalChanges).toBe(0);
    });

    it('recalculates totalChanges correctly', () => {
      const diff = {
        table: 'Article',
        rows: [
          {
            rowId: 'row-1',
            patches: [
              {
                path: 'title',
                currentValue: 'Old1',
                newValue: 'New1',
                op: 'replace',
                status: 'CHANGE' as const,
              },
              {
                path: 'status',
                currentValue: 'Old2',
                newValue: 'New2',
                op: 'replace',
                status: 'CHANGE' as const,
              },
              {
                path: 'count',
                currentValue: 10,
                newValue: 10,
                op: 'replace',
                status: 'SKIP' as const,
              },
            ],
          },
        ],
        summary: {
          totalRows: 1,
          totalChanges: 2,
          skipped: 1,
          errors: 0,
        },
      };

      const result = service.getChangesOnly(diff);

      expect(result.rows[0].patches).toHaveLength(2);
      expect(result.summary.totalChanges).toBe(2);
    });
  });
});
