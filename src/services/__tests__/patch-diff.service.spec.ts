import { Test, TestingModule } from '@nestjs/testing';
import { PatchDiffService } from '../patch-diff.service';
import { ConnectionService } from '../connection.service';
import { PatchFile } from '../../types/patch.types';

describe('PatchDiffService', () => {
  let service: PatchDiffService;
  let connectionServiceFake: {
    api: {
      rows: jest.Mock;
    };
  };

  beforeEach(async () => {
    connectionServiceFake = {
      api: {
        rows: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatchDiffService,
        {
          provide: ConnectionService,
          useValue: connectionServiceFake,
        },
      ],
    }).compile();

    service = module.get<PatchDiffService>(PatchDiffService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function mockRowsResponse(rows: { id: string; data: unknown }[]) {
    connectionServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: rows.map((row) => ({ node: row })),
        pageInfo: { hasNextPage: false },
      },
      error: null,
    });
  }

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

      mockRowsResponse([
        {
          id: 'row-1',
          data: {
            title: 'Old Title',
            status: 'published',
          },
        },
      ]);

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

      mockRowsResponse([
        {
          id: 'row-1',
          data: {
            title: 'Old Title',
            count: 10,
          },
        },
      ]);

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

      mockRowsResponse([
        {
          id: 'row-1',
          data: {
            title: 'Same Title',
            count: 42,
          },
        },
      ]);

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

      mockRowsResponse([
        {
          id: 'row-1',
          data: {
            metadata: {
              author: 'Jane Doe',
              version: 2,
            },
          },
        },
      ]);

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

      mockRowsResponse([
        {
          id: 'row-1',
          data: {
            tags: ['old-tag', 'tag2'],
          },
        },
      ]);

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

      mockRowsResponse([]);

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

      connectionServiceFake.api.rows.mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      await expect(
        service.compareWithApi(patches, 'revision-123'),
      ).rejects.toThrow('Failed to fetch rows');
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

      mockRowsResponse([
        { id: 'row-1', data: { title: 'Old Title 1' } },
        { id: 'row-2', data: { title: 'Old Title 2' } },
      ]);

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

      mockRowsResponse([{ id: 'row-1', data: { title: 'Title' } }]);

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

    it('uses bulk loading with where.id.in filter', async () => {
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

      mockRowsResponse([
        { id: 'row-1', data: { title: 'Old 1' } },
        { id: 'row-2', data: { title: 'Old 2' } },
      ]);

      await service.compareWithApi(patches, 'revision-123');

      expect(connectionServiceFake.api.rows).toHaveBeenCalledWith(
        'revision-123',
        'Article',
        {
          first: 100,
          where: {
            id: {
              in: ['row-1', 'row-2'],
            },
          },
        },
      );
    });

    it('calls progress callback during batch loading', async () => {
      const patches: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-15T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Title' }],
        },
      ];

      mockRowsResponse([{ id: 'row-1', data: { title: 'Old' } }]);

      const progressCallback = jest.fn();
      await service.compareWithApi(patches, 'revision-123', progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(0, 1);
      expect(progressCallback).toHaveBeenCalledWith(1, 1);
    });
  });
});
