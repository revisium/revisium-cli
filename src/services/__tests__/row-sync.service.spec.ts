import {
  RowSyncService,
  RowData,
  ApiClient,
  RowSyncError,
} from '../row-sync.service';
import { JsonValue } from '../../types/json.types';

describe('RowSyncService', () => {
  let service: RowSyncService;

  beforeEach(() => {
    service = new RowSyncService();
  });

  describe('categorizeRows', () => {
    it('categorizes new rows for creation', () => {
      const sourceRows: RowData[] = [
        { id: 'row1', data: { name: 'Test' } },
        { id: 'row2', data: { name: 'Test2' } },
      ];
      const existingRows = new Map<string, JsonValue>();

      const result = service.categorizeRows(sourceRows, existingRows);

      expect(result.rowsToCreate).toHaveLength(2);
      expect(result.rowsToUpdate).toHaveLength(0);
      expect(result.skippedCount).toBe(0);
    });

    it('categorizes identical rows as skipped', () => {
      const sourceRows: RowData[] = [{ id: 'row1', data: { name: 'Test' } }];
      const existingRows = new Map([['row1', { name: 'Test' }]]);

      const result = service.categorizeRows(sourceRows, existingRows);

      expect(result.rowsToCreate).toHaveLength(0);
      expect(result.rowsToUpdate).toHaveLength(0);
      expect(result.skippedCount).toBe(1);
    });

    it('categorizes changed rows for update', () => {
      const sourceRows: RowData[] = [
        { id: 'row1', data: { name: 'New Value' } },
      ];
      const existingRows = new Map([['row1', { name: 'Old Value' }]]);

      const result = service.categorizeRows(sourceRows, existingRows);

      expect(result.rowsToCreate).toHaveLength(0);
      expect(result.rowsToUpdate).toHaveLength(1);
      expect(result.skippedCount).toBe(0);
    });

    it('handles mixed operations', () => {
      const sourceRows: RowData[] = [
        { id: 'new1', data: { name: 'New' } },
        { id: 'unchanged', data: { name: 'Same' } },
        { id: 'changed', data: { name: 'Updated' } },
      ];
      const existingRows = new Map([
        ['unchanged', { name: 'Same' }],
        ['changed', { name: 'Original' }],
      ]);

      const result = service.categorizeRows(sourceRows, existingRows);

      expect(result.rowsToCreate).toHaveLength(1);
      expect(result.rowsToUpdate).toHaveLength(1);
      expect(result.skippedCount).toBe(1);
      expect(result.rowsToCreate[0].id).toBe('new1');
      expect(result.rowsToUpdate[0].id).toBe('changed');
    });
  });

  describe('getExistingRows', () => {
    it('fetches all rows with pagination', async () => {
      const mockApi: ApiClient = {
        rows: jest
          .fn()
          .mockResolvedValueOnce({
            data: {
              edges: [
                { node: { id: 'row1', data: { name: 'A' } } },
                { node: { id: 'row2', data: { name: 'B' } } },
              ],
              pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
            },
          })
          .mockResolvedValueOnce({
            data: {
              edges: [{ node: { id: 'row3', data: { name: 'C' } } }],
              pageInfo: { hasNextPage: false, endCursor: 'cursor2' },
            },
          }),
        createRows: jest.fn(),
        updateRows: jest.fn(),
        createRow: jest.fn(),
        updateRow: jest.fn(),
      };

      const result = await service.getExistingRows(mockApi, 'rev1', 'table1');

      expect(result.size).toBe(3);
      expect(result.get('row1')).toEqual({ name: 'A' });
      expect(result.get('row2')).toEqual({ name: 'B' });
      expect(result.get('row3')).toEqual({ name: 'C' });
      expect(mockApi.rows).toHaveBeenCalledTimes(2);
    });

    it('handles API error gracefully', async () => {
      const mockApi: ApiClient = {
        rows: jest.fn().mockResolvedValue({ error: 'Some error' }),
        createRows: jest.fn(),
        updateRows: jest.fn(),
        createRow: jest.fn(),
        updateRow: jest.fn(),
      };

      const result = await service.getExistingRows(mockApi, 'rev1', 'table1');

      expect(result.size).toBe(0);
    });

    it('calls progress callback', async () => {
      const mockApi: ApiClient = {
        rows: jest.fn().mockResolvedValue({
          data: {
            edges: [{ node: { id: 'row1', data: { name: 'A' } } }],
            pageInfo: { hasNextPage: false, endCursor: '' },
          },
        }),
        createRows: jest.fn(),
        updateRows: jest.fn(),
        createRow: jest.fn(),
        updateRow: jest.fn(),
      };
      const onProgress = jest.fn();

      await service.getExistingRows(mockApi, 'rev1', 'table1', onProgress);

      expect(onProgress).toHaveBeenCalledWith({
        operation: 'fetch',
        current: 1,
      });
    });
  });

  describe('syncTableRows', () => {
    it('syncs rows using bulk operations', async () => {
      const mockApi: ApiClient = {
        rows: jest.fn().mockResolvedValue({
          data: {
            edges: [],
            pageInfo: { hasNextPage: false, endCursor: '' },
          },
        }),
        createRows: jest.fn().mockResolvedValue({ data: {} }),
        updateRows: jest.fn(),
        createRow: jest.fn(),
        updateRow: jest.fn(),
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const sourceRows: RowData[] = [
        { id: 'row1', data: { name: 'A' } },
        { id: 'row2', data: { name: 'B' } },
      ];

      const stats = await service.syncTableRows(
        mockApi,
        'rev1',
        'table1',
        sourceRows,
        100,
      );

      expect(stats.created).toBe(2);
      expect(stats.updated).toBe(0);
      expect(stats.skipped).toBe(0);
      expect(mockApi.createRows).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('skips identical rows', async () => {
      const mockApi: ApiClient = {
        rows: jest.fn().mockResolvedValue({
          data: {
            edges: [{ node: { id: 'row1', data: { name: 'A' } } }],
            pageInfo: { hasNextPage: false, endCursor: '' },
          },
        }),
        createRows: jest.fn(),
        updateRows: jest.fn(),
        createRow: jest.fn(),
        updateRow: jest.fn(),
      };

      const sourceRows: RowData[] = [{ id: 'row1', data: { name: 'A' } }];

      const stats = await service.syncTableRows(
        mockApi,
        'rev1',
        'table1',
        sourceRows,
        100,
      );

      expect(stats.created).toBe(0);
      expect(stats.updated).toBe(0);
      expect(stats.skipped).toBe(1);
      expect(mockApi.createRows).not.toHaveBeenCalled();
      expect(mockApi.updateRows).not.toHaveBeenCalled();
    });

    it('updates changed rows', async () => {
      const mockApi: ApiClient = {
        rows: jest.fn().mockResolvedValue({
          data: {
            edges: [{ node: { id: 'row1', data: { name: 'Old' } } }],
            pageInfo: { hasNextPage: false, endCursor: '' },
          },
        }),
        createRows: jest.fn(),
        updateRows: jest.fn().mockResolvedValue({ data: {} }),
        createRow: jest.fn(),
        updateRow: jest.fn(),
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const sourceRows: RowData[] = [{ id: 'row1', data: { name: 'New' } }];

      const stats = await service.syncTableRows(
        mockApi,
        'rev1',
        'table1',
        sourceRows,
        100,
      );

      expect(stats.created).toBe(0);
      expect(stats.updated).toBe(1);
      expect(stats.skipped).toBe(0);
      expect(mockApi.updateRows).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('RowSyncError', () => {
    it('creates error with all properties', () => {
      const error = new RowSyncError('Test error', 'table1', 500, 100);

      expect(error.message).toBe('Test error');
      expect(error.tableId).toBe('table1');
      expect(error.statusCode).toBe(500);
      expect(error.batchSize).toBe(100);
      expect(error.name).toBe('RowSyncError');
    });

    it('creates error with minimal properties', () => {
      const error = new RowSyncError('Test error', 'table1');

      expect(error.message).toBe('Test error');
      expect(error.tableId).toBe('table1');
      expect(error.statusCode).toBeUndefined();
      expect(error.batchSize).toBeUndefined();
    });
  });
});
