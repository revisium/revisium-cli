import { Test, TestingModule } from '@nestjs/testing';
import { SyncDataService } from '../sync-data.service';
import { SyncApiService, ConnectionInfo } from '../sync-api.service';
import { TableDependencyService } from '../table-dependency.service';
import { RowSyncService, RowSyncError } from '../row-sync.service';

describe('SyncDataService', () => {
  let service: SyncDataService;
  let mockTables: jest.Mock;
  let mockTableSchema: jest.Mock;
  let mockRows: jest.Mock;
  let mockSyncTableRows: jest.Mock;
  let mockGetExistingRows: jest.Mock;
  let mockCategorizeRows: jest.Mock;
  let mockAnalyzeDependencies: jest.Mock;
  let mockFormatDependencyInfo: jest.Mock;

  const createMockConnection = (
    revisionId: string,
    draftRevisionId: string,
    tables: jest.Mock,
    tableSchema: jest.Mock,
    rows: jest.Mock,
  ): ConnectionInfo =>
    ({
      url: {
        baseUrl: 'http://localhost:8080',
        auth: { method: 'password', username: 'admin', password: 'pass' },
        organization: 'org',
        project: 'proj',
        branch: 'master',
        revision: 'draft',
      },
      client: {
        api: {
          tables,
          tableSchema,
          rows,
        },
      },
      revisionId,
      headRevisionId: 'head-123',
      draftRevisionId,
    }) as unknown as ConnectionInfo;

  beforeEach(async () => {
    mockTables = jest.fn();
    mockTableSchema = jest.fn();
    mockRows = jest.fn();
    mockSyncTableRows = jest.fn();
    mockGetExistingRows = jest.fn();
    mockCategorizeRows = jest.fn();
    mockAnalyzeDependencies = jest.fn();
    mockFormatDependencyInfo = jest.fn();

    const sourceConnection = createMockConnection(
      'source-rev-123',
      'source-draft-456',
      mockTables,
      mockTableSchema,
      mockRows,
    );
    const targetConnection = createMockConnection(
      'target-draft-789',
      'target-draft-789',
      jest.fn(),
      jest.fn(),
      jest.fn(),
    );

    const mockSyncApi = {
      get source() {
        return sourceConnection;
      },
      get target() {
        return targetConnection;
      },
    };

    const mockRowSync = {
      syncTableRows: mockSyncTableRows,
      getExistingRows: mockGetExistingRows,
      categorizeRows: mockCategorizeRows,
    };

    const mockTableDependency = {
      analyzeDependencies: mockAnalyzeDependencies,
      formatDependencyInfo: mockFormatDependencyInfo,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncDataService,
        { provide: SyncApiService, useValue: mockSyncApi },
        { provide: RowSyncService, useValue: mockRowSync },
        { provide: TableDependencyService, useValue: mockTableDependency },
      ],
    }).compile();

    service = module.get<SyncDataService>(SyncDataService);
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(process.stdout, 'write').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sync', () => {
    it('returns empty result when no tables found', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });

      const result = await service.sync();

      expect(result).toEqual({
        tables: [],
        totalRowsCreated: 0,
        totalRowsUpdated: 0,
        totalRowsSkipped: 0,
        totalErrors: 0,
      });
    });

    it('syncs single table with all new rows', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'users' } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Alice' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockSyncTableRows.mockResolvedValue({
        totalRows: 1,
        created: 1,
        updated: 0,
        skipped: 0,
        createErrors: 0,
        updateErrors: 0,
      });

      const result = await service.sync();

      expect(result.totalRowsCreated).toBe(1);
      expect(result.totalRowsUpdated).toBe(0);
      expect(result.totalRowsSkipped).toBe(0);
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].tableId).toBe('users');
    });

    it('filters tables when tableFilter is provided', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [
            { node: { id: 'users' } },
            { node: { id: 'posts' } },
            { node: { id: 'comments' } },
          ],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users', 'posts'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockSyncTableRows.mockResolvedValue({
        totalRows: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        createErrors: 0,
        updateErrors: 0,
      });

      const result = await service.sync({ tables: ['users', 'posts'] });

      expect(result.tables).toHaveLength(2);
      expect(mockTables).toHaveBeenCalled();
    });

    it('paginates through tables', async () => {
      mockTables
        .mockResolvedValueOnce({
          data: {
            edges: [{ node: { id: 'table1' } }],
            pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
          },
        })
        .mockResolvedValueOnce({
          data: {
            edges: [{ node: { id: 'table2' } }],
            pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
          },
        });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['table1', 'table2'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockSyncTableRows.mockResolvedValue({
        totalRows: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        createErrors: 0,
        updateErrors: 0,
      });

      const result = await service.sync();

      expect(mockTables).toHaveBeenCalledTimes(2);
      expect(result.tables).toHaveLength(2);
    });

    it('throws error when getting tables fails', async () => {
      mockTables.mockResolvedValue({
        error: { message: 'Not found' },
      });

      await expect(service.sync()).rejects.toThrow('Failed to get tables');
    });

    it('handles warnings from dependency analysis', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'users' } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users'],
        circularDependencies: [],
        warnings: ['Warning: circular dependency'],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockSyncTableRows.mockResolvedValue({
        totalRows: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        createErrors: 0,
        updateErrors: 0,
      });

      await service.sync();

      expect(console.warn).toHaveBeenCalledWith('Warning: circular dependency');
    });

    it('handles schema fetch error gracefully', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'users' } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockRejectedValue(new Error('Schema not found'));
      mockRows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockSyncTableRows.mockResolvedValue({
        totalRows: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        createErrors: 0,
        updateErrors: 0,
      });

      await service.sync();

      expect(console.warn).toHaveBeenCalled();
    });

    it('aggregates stats from multiple tables', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'users' } }, { node: { id: 'posts' } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: {} } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users', 'posts'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockSyncTableRows
        .mockResolvedValueOnce({
          totalRows: 2,
          created: 2,
          updated: 0,
          skipped: 0,
          createErrors: 0,
          updateErrors: 0,
        })
        .mockResolvedValueOnce({
          totalRows: 3,
          created: 1,
          updated: 1,
          skipped: 1,
          createErrors: 0,
          updateErrors: 0,
        });

      const result = await service.sync();

      expect(result.totalRowsCreated).toBe(3);
      expect(result.totalRowsUpdated).toBe(1);
      expect(result.totalRowsSkipped).toBe(1);
    });

    it('uses custom batch size', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'users' } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: {} } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockSyncTableRows.mockResolvedValue({
        totalRows: 1,
        created: 1,
        updated: 0,
        skipped: 0,
        createErrors: 0,
        updateErrors: 0,
      });

      await service.sync({ batchSize: 50 });

      expect(mockSyncTableRows).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'users',
        expect.anything(),
        50,
        expect.anything(),
        expect.anything(),
      );
    });

    it('throws and logs RowSyncError', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'users' } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockSyncTableRows.mockRejectedValue(
        new RowSyncError('Sync failed', 'users', 500, 100),
      );

      await expect(service.sync()).rejects.toThrow(RowSyncError);
      expect(console.error).toHaveBeenCalled();
    });

    it('throws and logs RowSyncError with 413 status', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'users' } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockSyncTableRows.mockRejectedValue(
        new RowSyncError('Payload too large', 'users', 413, 100),
      );

      await expect(service.sync()).rejects.toThrow(RowSyncError);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('payload is too large'),
      );
    });

    it('throws generic error', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'users' } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockSyncTableRows.mockRejectedValue(new Error('Network error'));

      await expect(service.sync()).rejects.toThrow('Network error');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Sync stopped due to error'),
        'Network error',
      );
    });
  });

  describe('sync with dryRun', () => {
    it('analyzes tables without applying changes', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'users' } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Alice' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockGetExistingRows.mockResolvedValue(new Map());
      mockCategorizeRows.mockReturnValue({
        rowsToCreate: [{ id: 'row-1', data: { name: 'Alice' } }],
        rowsToUpdate: [],
        skippedCount: 0,
      });

      const result = await service.sync({ dryRun: true });

      expect(result.totalRowsCreated).toBe(1);
      expect(result.totalRowsUpdated).toBe(0);
      expect(mockSyncTableRows).not.toHaveBeenCalled();
    });

    it('handles getExistingRows error in dry run', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'users' } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Alice' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockGetExistingRows.mockRejectedValue(new Error('Table not found'));
      mockCategorizeRows.mockReturnValue({
        rowsToCreate: [{ id: 'row-1', data: {} }],
        rowsToUpdate: [],
        skippedCount: 0,
      });

      const result = await service.sync({ dryRun: true });

      expect(result.tables).toHaveLength(1);
    });

    it('shows changes in dry run output', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'users' } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows.mockResolvedValue({
        data: {
          edges: [
            { node: { id: 'row-1', data: { name: 'Alice' } } },
            { node: { id: 'row-2', data: { name: 'Bob' } } },
          ],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockGetExistingRows.mockResolvedValue(
        new Map([['row-1', { name: 'Old Alice' }]]),
      );
      mockCategorizeRows.mockReturnValue({
        rowsToCreate: [{ id: 'row-2', data: { name: 'Bob' } }],
        rowsToUpdate: [{ id: 'row-1', data: { name: 'Alice' } }],
        skippedCount: 0,
      });

      const result = await service.sync({ dryRun: true });

      expect(result.totalRowsCreated).toBe(1);
      expect(result.totalRowsUpdated).toBe(1);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('1 to create'),
      );
    });

    it('does not log table when no changes in dry run', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'users' } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Alice' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockGetExistingRows.mockResolvedValue(
        new Map([['row-1', { name: 'Alice' }]]),
      );
      mockCategorizeRows.mockReturnValue({
        rowsToCreate: [],
        rowsToUpdate: [],
        skippedCount: 1,
      });

      const result = await service.sync({ dryRun: true });

      expect(result.totalRowsSkipped).toBe(1);
      expect(result.totalRowsCreated).toBe(0);
      expect(result.totalRowsUpdated).toBe(0);
    });
  });

  describe('source row fetching', () => {
    it('paginates source rows', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'users' } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows
        .mockResolvedValueOnce({
          data: {
            edges: [{ node: { id: 'row-1', data: { name: 'Alice' } } }],
            pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
          },
        })
        .mockResolvedValueOnce({
          data: {
            edges: [{ node: { id: 'row-2', data: { name: 'Bob' } } }],
            pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
          },
        });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');
      mockSyncTableRows.mockResolvedValue({
        totalRows: 2,
        created: 2,
        updated: 0,
        skipped: 0,
        createErrors: 0,
        updateErrors: 0,
      });

      await service.sync();

      expect(mockRows).toHaveBeenCalledTimes(2);
    });

    it('throws error when fetching rows fails', async () => {
      mockTables.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'users' } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockTableSchema.mockResolvedValue({
        data: { type: 'object', properties: {} },
      });
      mockRows.mockResolvedValue({
        error: { message: 'Not found' },
      });
      mockAnalyzeDependencies.mockReturnValue({
        sortedTables: ['users'],
        circularDependencies: [],
        warnings: [],
      });
      mockFormatDependencyInfo.mockReturnValue('Dependency info');

      await expect(service.sync()).rejects.toThrow('Failed to get rows');
    });
  });
});
