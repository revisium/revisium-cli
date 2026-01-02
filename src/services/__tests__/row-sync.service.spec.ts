/* eslint-disable @typescript-eslint/unbound-method */
import {
  RowSyncService,
  RowData,
  RowSyncError,
  BulkSupportFlags,
  ApiClient,
} from '../row-sync.service';

describe('RowSyncService', () => {
  let service: RowSyncService;
  let mockApi: jest.Mocked<ApiClient>;

  const createMockApi = (): jest.Mocked<ApiClient> => ({
    rows: jest.fn(),
    createRows: jest.fn(),
    updateRows: jest.fn(),
    createRow: jest.fn(),
    updateRow: jest.fn(),
  });

  const createRowData = (
    id: string,
    data: Record<string, unknown>,
  ): RowData => ({
    id,
    data,
  });

  beforeEach(() => {
    service = new RowSyncService();
    mockApi = createMockApi();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getExistingRows', () => {
    it('returns empty map when table has no rows', async () => {
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });

      const result = await service.getExistingRows(mockApi, 'rev-1', 'users');

      expect(result.size).toBe(0);
      expect(mockApi.rows).toHaveBeenCalledWith('rev-1', 'users', {
        first: 100,
        after: undefined,
        orderBy: [{ field: 'id', direction: 'asc' }],
      });
    });

    it('fetches all rows from single page', async () => {
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [
            { node: { id: 'row-1', data: { name: 'Alice' } } },
            { node: { id: 'row-2', data: { name: 'Bob' } } },
          ],
          pageInfo: { hasNextPage: false, endCursor: 'cursor-1' },
        },
      });

      const result = await service.getExistingRows(mockApi, 'rev-1', 'users');

      expect(result.size).toBe(2);
      expect(result.get('row-1')).toEqual({ name: 'Alice' });
      expect(result.get('row-2')).toEqual({ name: 'Bob' });
    });

    it('paginates through multiple pages', async () => {
      mockApi.rows
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

      const result = await service.getExistingRows(mockApi, 'rev-1', 'users');

      expect(result.size).toBe(2);
      expect(mockApi.rows).toHaveBeenCalledTimes(2);
      expect(mockApi.rows).toHaveBeenNthCalledWith(2, 'rev-1', 'users', {
        first: 100,
        after: 'cursor-1',
        orderBy: [{ field: 'id', direction: 'asc' }],
      });
    });

    it('stops fetching on error response', async () => {
      mockApi.rows.mockResolvedValue({
        error: { message: 'Not found' },
      });

      const result = await service.getExistingRows(mockApi, 'rev-1', 'users');

      expect(result.size).toBe(0);
    });

    it('calls progress callback during fetch', async () => {
      const onProgress = jest.fn();
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: {} } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });

      await service.getExistingRows(mockApi, 'rev-1', 'users', onProgress);

      expect(onProgress).toHaveBeenCalledWith({
        operation: 'fetch',
        current: 1,
      });
    });
  });

  describe('categorizeRows', () => {
    it('returns empty arrays when no source rows', () => {
      const result = service.categorizeRows([], new Map());

      expect(result.rowsToCreate).toEqual([]);
      expect(result.rowsToUpdate).toEqual([]);
      expect(result.skippedCount).toBe(0);
    });

    it('categorizes new rows for creation', () => {
      const sourceRows = [
        createRowData('row-1', { name: 'Alice' }),
        createRowData('row-2', { name: 'Bob' }),
      ];

      const result = service.categorizeRows(sourceRows, new Map());

      expect(result.rowsToCreate).toHaveLength(2);
      expect(result.rowsToUpdate).toHaveLength(0);
      expect(result.skippedCount).toBe(0);
    });

    it('categorizes modified rows for update', () => {
      const sourceRows = [createRowData('row-1', { name: 'Alice Updated' })];
      const existingRows = new Map([['row-1', { name: 'Alice' }]]);

      const result = service.categorizeRows(sourceRows, existingRows);

      expect(result.rowsToCreate).toHaveLength(0);
      expect(result.rowsToUpdate).toHaveLength(1);
      expect(result.skippedCount).toBe(0);
    });

    it('skips unchanged rows', () => {
      const sourceRows = [createRowData('row-1', { name: 'Alice' })];
      const existingRows = new Map([['row-1', { name: 'Alice' }]]);

      const result = service.categorizeRows(sourceRows, existingRows);

      expect(result.rowsToCreate).toHaveLength(0);
      expect(result.rowsToUpdate).toHaveLength(0);
      expect(result.skippedCount).toBe(1);
    });

    it('handles mixed scenarios', () => {
      const sourceRows = [
        createRowData('row-1', { name: 'Unchanged' }),
        createRowData('row-2', { name: 'Modified' }),
        createRowData('row-3', { name: 'New' }),
      ];
      const existingRows = new Map([
        ['row-1', { name: 'Unchanged' }],
        ['row-2', { name: 'Original' }],
      ]);

      const result = service.categorizeRows(sourceRows, existingRows);

      expect(result.rowsToCreate).toHaveLength(1);
      expect(result.rowsToCreate[0].id).toBe('row-3');
      expect(result.rowsToUpdate).toHaveLength(1);
      expect(result.rowsToUpdate[0].id).toBe('row-2');
      expect(result.skippedCount).toBe(1);
    });
  });

  describe('syncTableRows', () => {
    it('returns correct stats when no rows to sync', async () => {
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });

      const stats = await service.syncTableRows(
        mockApi,
        'target-rev',
        'users',
        [],
      );

      expect(stats).toEqual({
        totalRows: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        createErrors: 0,
        updateErrors: 0,
      });
    });

    it('creates new rows using bulk API', async () => {
      mockApi.rows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockApi.createRows.mockResolvedValue({ data: { success: true } });

      const sourceRows = [
        createRowData('row-1', { name: 'Alice' }),
        createRowData('row-2', { name: 'Bob' }),
      ];

      const stats = await service.syncTableRows(
        mockApi,
        'target-rev',
        'users',
        sourceRows,
      );

      expect(stats.created).toBe(2);
      expect(mockApi.createRows).toHaveBeenCalledWith('target-rev', 'users', {
        rows: [
          { rowId: 'row-1', data: { name: 'Alice' } },
          { rowId: 'row-2', data: { name: 'Bob' } },
        ],
        isRestore: true,
      });
    });

    it('updates existing rows using bulk API', async () => {
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Old' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockApi.updateRows.mockResolvedValue({ data: { success: true } });

      const sourceRows = [createRowData('row-1', { name: 'New' })];

      const stats = await service.syncTableRows(
        mockApi,
        'target-rev',
        'users',
        sourceRows,
      );

      expect(stats.updated).toBe(1);
      expect(mockApi.updateRows).toHaveBeenCalledWith('target-rev', 'users', {
        rows: [{ rowId: 'row-1', data: { name: 'New' } }],
      });
    });

    it('skips unchanged rows', async () => {
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Alice' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });

      const sourceRows = [createRowData('row-1', { name: 'Alice' })];

      const stats = await service.syncTableRows(
        mockApi,
        'target-rev',
        'users',
        sourceRows,
      );

      expect(stats.skipped).toBe(1);
      expect(stats.created).toBe(0);
      expect(stats.updated).toBe(0);
    });

    it('falls back to single-row create on 404', async () => {
      mockApi.rows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockApi.createRows.mockResolvedValue({ error: { statusCode: 404 } });
      mockApi.createRow.mockResolvedValue({ data: { success: true } });

      const sourceRows = [createRowData('row-1', { name: 'Alice' })];
      const bulkFlags: BulkSupportFlags = {};

      const stats = await service.syncTableRows(
        mockApi,
        'target-rev',
        'users',
        sourceRows,
        100,
        bulkFlags,
      );

      expect(stats.created).toBe(1);
      expect(bulkFlags.bulkCreateSupported).toBe(false);
      expect(mockApi.createRow).toHaveBeenCalled();
    });

    it('falls back to single-row update on 404', async () => {
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Old' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockApi.updateRows.mockResolvedValue({ error: { statusCode: 404 } });
      mockApi.updateRow.mockResolvedValue({ data: { success: true } });

      const sourceRows = [createRowData('row-1', { name: 'New' })];
      const bulkFlags: BulkSupportFlags = {};

      const stats = await service.syncTableRows(
        mockApi,
        'target-rev',
        'users',
        sourceRows,
        100,
        bulkFlags,
      );

      expect(stats.updated).toBe(1);
      expect(bulkFlags.bulkUpdateSupported).toBe(false);
      expect(mockApi.updateRow).toHaveBeenCalled();
    });

    it('respects pre-set bulkCreateSupported=false flag', async () => {
      mockApi.rows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockApi.createRow.mockResolvedValue({ data: { success: true } });

      const sourceRows = [createRowData('row-1', { name: 'Alice' })];
      const bulkFlags: BulkSupportFlags = { bulkCreateSupported: false };

      await service.syncTableRows(
        mockApi,
        'target-rev',
        'users',
        sourceRows,
        100,
        bulkFlags,
      );

      expect(mockApi.createRows).not.toHaveBeenCalled();
      expect(mockApi.createRow).toHaveBeenCalled();
    });

    it('respects pre-set bulkUpdateSupported=false flag', async () => {
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Old' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockApi.updateRow.mockResolvedValue({ data: { success: true } });

      const sourceRows = [createRowData('row-1', { name: 'New' })];
      const bulkFlags: BulkSupportFlags = { bulkUpdateSupported: false };

      await service.syncTableRows(
        mockApi,
        'target-rev',
        'users',
        sourceRows,
        100,
        bulkFlags,
      );

      expect(mockApi.updateRows).not.toHaveBeenCalled();
      expect(mockApi.updateRow).toHaveBeenCalled();
    });

    it('throws RowSyncError on bulk create failure with status code', async () => {
      mockApi.rows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockApi.createRows.mockResolvedValue({
        error: { statusCode: 413, message: 'Payload too large' },
      });

      const sourceRows = [createRowData('row-1', { name: 'Alice' })];

      await expect(
        service.syncTableRows(mockApi, 'target-rev', 'users', sourceRows),
      ).rejects.toThrow(RowSyncError);
    });

    it('throws RowSyncError on bulk update failure', async () => {
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Old' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockApi.updateRows.mockResolvedValue({
        error: { statusCode: 500, message: 'Server error' },
      });

      const sourceRows = [createRowData('row-1', { name: 'New' })];

      await expect(
        service.syncTableRows(mockApi, 'target-rev', 'users', sourceRows),
      ).rejects.toThrow(RowSyncError);
    });

    it('throws RowSyncError on single-row create failure', async () => {
      mockApi.rows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockApi.createRow.mockResolvedValue({
        error: { statusCode: 400, message: 'Bad request' },
      });

      const sourceRows = [createRowData('row-1', { name: 'Alice' })];
      const bulkFlags: BulkSupportFlags = { bulkCreateSupported: false };

      await expect(
        service.syncTableRows(
          mockApi,
          'target-rev',
          'users',
          sourceRows,
          100,
          bulkFlags,
        ),
      ).rejects.toThrow(RowSyncError);
    });

    it('throws RowSyncError on single-row update failure', async () => {
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Old' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockApi.updateRow.mockResolvedValue({
        error: { statusCode: 400, message: 'Bad request' },
      });

      const sourceRows = [createRowData('row-1', { name: 'New' })];
      const bulkFlags: BulkSupportFlags = { bulkUpdateSupported: false };

      await expect(
        service.syncTableRows(
          mockApi,
          'target-rev',
          'users',
          sourceRows,
          100,
          bulkFlags,
        ),
      ).rejects.toThrow(RowSyncError);
    });

    it('processes rows in batches', async () => {
      mockApi.rows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockApi.createRows.mockResolvedValue({ data: { success: true } });

      const sourceRows = [
        createRowData('row-1', { name: 'A' }),
        createRowData('row-2', { name: 'B' }),
        createRowData('row-3', { name: 'C' }),
      ];

      await service.syncTableRows(
        mockApi,
        'target-rev',
        'users',
        sourceRows,
        2,
      );

      expect(mockApi.createRows).toHaveBeenCalledTimes(2);

      const firstCall = mockApi.createRows.mock.calls[0];
      expect(firstCall[0]).toBe('target-rev');
      expect(firstCall[1]).toBe('users');
      const firstBatch = firstCall[2] as { rows: { rowId: string }[] };
      expect(firstBatch.rows.map((r) => r.rowId)).toEqual(['row-1', 'row-2']);

      const secondCall = mockApi.createRows.mock.calls[1];
      expect(secondCall[0]).toBe('target-rev');
      expect(secondCall[1]).toBe('users');
      const secondBatch = secondCall[2] as { rows: { rowId: string }[] };
      expect(secondBatch.rows.map((r) => r.rowId)).toEqual(['row-3']);
    });

    it('calls progress callback during sync', async () => {
      const onProgress = jest.fn();
      mockApi.rows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockApi.createRows.mockResolvedValue({ data: { success: true } });

      const sourceRows = [createRowData('row-1', { name: 'Alice' })];

      await service.syncTableRows(
        mockApi,
        'target-rev',
        'users',
        sourceRows,
        100,
        {},
        onProgress,
      );

      expect(onProgress).toHaveBeenCalledWith({
        operation: 'create',
        current: 1,
        total: 1,
      });
    });
  });

  describe('RowSyncError', () => {
    it('creates error with all properties', () => {
      const error = new RowSyncError('Test error', 'users', 413, 100);

      expect(error.message).toBe('Test error');
      expect(error.tableId).toBe('users');
      expect(error.statusCode).toBe(413);
      expect(error.batchSize).toBe(100);
      expect(error.name).toBe('RowSyncError');
    });

    it('creates error with minimal properties', () => {
      const error = new RowSyncError('Test error', 'users');

      expect(error.message).toBe('Test error');
      expect(error.tableId).toBe('users');
      expect(error.statusCode).toBeUndefined();
      expect(error.batchSize).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('handles exception during bulk create', async () => {
      mockApi.rows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockApi.createRows.mockRejectedValue(new Error('Network error'));

      const sourceRows = [createRowData('row-1', { name: 'Alice' })];

      await expect(
        service.syncTableRows(mockApi, 'target-rev', 'users', sourceRows),
      ).rejects.toThrow(RowSyncError);
    });

    it('handles exception during bulk update', async () => {
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Old' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockApi.updateRows.mockRejectedValue(new Error('Network error'));

      const sourceRows = [createRowData('row-1', { name: 'New' })];

      await expect(
        service.syncTableRows(mockApi, 'target-rev', 'users', sourceRows),
      ).rejects.toThrow(RowSyncError);
    });

    it('handles 404 exception during bulk create', async () => {
      mockApi.rows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockApi.createRows.mockRejectedValue({ statusCode: 404 });
      mockApi.createRow.mockResolvedValue({ data: { success: true } });

      const sourceRows = [createRowData('row-1', { name: 'Alice' })];
      const bulkFlags: BulkSupportFlags = {};

      const stats = await service.syncTableRows(
        mockApi,
        'target-rev',
        'users',
        sourceRows,
        100,
        bulkFlags,
      );

      expect(stats.created).toBe(1);
      expect(bulkFlags.bulkCreateSupported).toBe(false);
    });

    it('handles 404 exception during bulk update', async () => {
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Old' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockApi.updateRows.mockRejectedValue({ status: 404 });
      mockApi.updateRow.mockResolvedValue({ data: { success: true } });

      const sourceRows = [createRowData('row-1', { name: 'New' })];
      const bulkFlags: BulkSupportFlags = {};

      const stats = await service.syncTableRows(
        mockApi,
        'target-rev',
        'users',
        sourceRows,
        100,
        bulkFlags,
      );

      expect(stats.updated).toBe(1);
      expect(bulkFlags.bulkUpdateSupported).toBe(false);
    });

    it('rethrows RowSyncError during bulk create', async () => {
      mockApi.rows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      const originalError = new RowSyncError('Original error', 'users', 500);
      mockApi.createRows.mockRejectedValue(originalError);

      const sourceRows = [createRowData('row-1', { name: 'Alice' })];

      await expect(
        service.syncTableRows(mockApi, 'target-rev', 'users', sourceRows),
      ).rejects.toBe(originalError);
    });

    it('rethrows RowSyncError during bulk update', async () => {
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Old' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      const originalError = new RowSyncError('Original error', 'users', 500);
      mockApi.updateRows.mockRejectedValue(originalError);

      const sourceRows = [createRowData('row-1', { name: 'New' })];

      await expect(
        service.syncTableRows(mockApi, 'target-rev', 'users', sourceRows),
      ).rejects.toBe(originalError);
    });

    it('handles exception during single-row create', async () => {
      mockApi.rows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockApi.createRow.mockRejectedValue(new Error('Network error'));

      const sourceRows = [createRowData('row-1', { name: 'Alice' })];
      const bulkFlags: BulkSupportFlags = { bulkCreateSupported: false };

      await expect(
        service.syncTableRows(
          mockApi,
          'target-rev',
          'users',
          sourceRows,
          100,
          bulkFlags,
        ),
      ).rejects.toThrow(RowSyncError);
    });

    it('handles exception during single-row update', async () => {
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Old' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockApi.updateRow.mockRejectedValue(new Error('Network error'));

      const sourceRows = [createRowData('row-1', { name: 'New' })];
      const bulkFlags: BulkSupportFlags = { bulkUpdateSupported: false };

      await expect(
        service.syncTableRows(
          mockApi,
          'target-rev',
          'users',
          sourceRows,
          100,
          bulkFlags,
        ),
      ).rejects.toThrow(RowSyncError);
    });

    it('rethrows RowSyncError during single-row create', async () => {
      mockApi.rows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      const originalError = new RowSyncError('Original error', 'users', 500);
      mockApi.createRow.mockRejectedValue(originalError);

      const sourceRows = [createRowData('row-1', { name: 'Alice' })];
      const bulkFlags: BulkSupportFlags = { bulkCreateSupported: false };

      await expect(
        service.syncTableRows(
          mockApi,
          'target-rev',
          'users',
          sourceRows,
          100,
          bulkFlags,
        ),
      ).rejects.toBe(originalError);
    });

    it('rethrows RowSyncError during single-row update', async () => {
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [{ node: { id: 'row-1', data: { name: 'Old' } } }],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      const originalError = new RowSyncError('Original error', 'users', 500);
      mockApi.updateRow.mockRejectedValue(originalError);

      const sourceRows = [createRowData('row-1', { name: 'New' })];
      const bulkFlags: BulkSupportFlags = { bulkUpdateSupported: false };

      await expect(
        service.syncTableRows(
          mockApi,
          'target-rev',
          'users',
          sourceRows,
          100,
          bulkFlags,
        ),
      ).rejects.toBe(originalError);
    });

    it('logs bulk create supported message only once', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      mockApi.rows.mockResolvedValue({
        data: { edges: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      });
      mockApi.createRows.mockResolvedValue({ data: { success: true } });

      const sourceRows = [
        createRowData('row-1', { name: 'A' }),
        createRowData('row-2', { name: 'B' }),
        createRowData('row-3', { name: 'C' }),
      ];

      await service.syncTableRows(
        mockApi,
        'target-rev',
        'users',
        sourceRows,
        2,
      );

      const bulkSupportedCalls = consoleSpy.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('Bulk create supported'),
      );
      expect(bulkSupportedCalls).toHaveLength(1);
    });

    it('logs bulk update supported message only once', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      mockApi.rows.mockResolvedValue({
        data: {
          edges: [
            { node: { id: 'row-1', data: { name: 'Old1' } } },
            { node: { id: 'row-2', data: { name: 'Old2' } } },
            { node: { id: 'row-3', data: { name: 'Old3' } } },
          ],
          pageInfo: { hasNextPage: false, endCursor: '' },
        },
      });
      mockApi.updateRows.mockResolvedValue({ data: { success: true } });

      const sourceRows = [
        createRowData('row-1', { name: 'New1' }),
        createRowData('row-2', { name: 'New2' }),
        createRowData('row-3', { name: 'New3' }),
      ];

      await service.syncTableRows(
        mockApi,
        'target-rev',
        'users',
        sourceRows,
        2,
      );

      const bulkSupportedCalls = consoleSpy.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('Bulk update supported'),
      );
      expect(bulkSupportedCalls).toHaveLength(1);
    });
  });
});
