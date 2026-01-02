import { Test, TestingModule } from '@nestjs/testing';
import { SyncSchemaService } from '../sync-schema.service';
import { SyncApiService, ConnectionInfo } from '../sync-api.service';
import { Migration } from '../../types/migration.types';

describe('SyncSchemaService', () => {
  let service: SyncSchemaService;
  let mockMigrations: jest.Mock;
  let mockApplyMigrations: jest.Mock;

  const createMockConnection = (
    revisionId: string,
    headRevisionId: string,
    draftRevisionId: string,
    migrations: jest.Mock,
    applyMigrations: jest.Mock,
  ): ConnectionInfo =>
    ({
      url: {
        baseUrl: 'http://localhost:8080',
        username: 'admin',
        password: 'pass',
        organization: 'org',
        project: 'proj',
        branch: 'master',
      },
      client: {
        api: {
          migrations,
          applyMigrations,
        },
      },
      revisionId,
      headRevisionId,
      draftRevisionId,
    }) as unknown as ConnectionInfo;

  beforeEach(async () => {
    mockMigrations = jest.fn();
    mockApplyMigrations = jest.fn();

    const sourceConnection = createMockConnection(
      'source-head-123',
      'source-head-123',
      'source-draft-456',
      mockMigrations,
      jest.fn(),
    );
    const targetConnection = createMockConnection(
      'target-draft-012',
      'target-head-789',
      'target-draft-012',
      jest.fn(),
      mockApplyMigrations,
    );

    const mockSyncApi = {
      get source() {
        return sourceConnection;
      },
      get target() {
        return targetConnection;
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncSchemaService,
        { provide: SyncApiService, useValue: mockSyncApi },
      ],
    }).compile();

    service = module.get<SyncSchemaService>(SyncSchemaService);
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sync', () => {
    it('returns empty result when no migrations found', async () => {
      mockMigrations.mockResolvedValue({
        data: [],
        error: undefined,
      });

      const result = await service.sync();

      expect(result).toEqual({
        migrationsApplied: 0,
        tablesCreated: [],
        tablesUpdated: [],
        tablesRemoved: [],
      });
      expect(mockMigrations).toHaveBeenCalledWith('source-head-123');
    });

    it('applies init migrations and tracks created tables', async () => {
      const migrations: Migration[] = [
        {
          changeType: 'init',
          id: '2024-01-01T00:00:00.000Z',
          tableId: 'users',
          hash: 'abc123',
          schema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
            required: [],
          },
        },
      ];

      mockMigrations.mockResolvedValue({
        data: migrations,
        error: undefined,
      });
      mockApplyMigrations.mockResolvedValue({
        data: [{ id: '2024-01-01T00:00:00.000Z', status: 'applied' }],
        error: undefined,
      });

      const result = await service.sync();

      expect(result).toEqual({
        migrationsApplied: 1,
        tablesCreated: ['users'],
        tablesUpdated: [],
        tablesRemoved: [],
      });
      expect(mockApplyMigrations).toHaveBeenCalledWith('target-draft-012', [
        migrations[0],
      ]);
    });

    it('applies update migrations and tracks updated tables', async () => {
      const migrations: Migration[] = [
        {
          changeType: 'update',
          id: '2024-01-02T00:00:00.000Z',
          tableId: 'users',
          hash: 'def456',
          patches: [
            {
              op: 'add',
              path: '/properties/email',
              value: { type: 'string', default: '' },
            },
          ],
        },
      ];

      mockMigrations.mockResolvedValue({
        data: migrations,
        error: undefined,
      });
      mockApplyMigrations.mockResolvedValue({
        data: [{ id: '2024-01-02T00:00:00.000Z', status: 'applied' }],
        error: undefined,
      });

      const result = await service.sync();

      expect(result).toEqual({
        migrationsApplied: 1,
        tablesCreated: [],
        tablesUpdated: ['users'],
        tablesRemoved: [],
      });
    });

    it('applies remove migrations and tracks removed tables', async () => {
      const migrations: Migration[] = [
        {
          changeType: 'remove',
          id: '2024-01-03T00:00:00.000Z',
          tableId: 'deprecated_table',
        },
      ];

      mockMigrations.mockResolvedValue({
        data: migrations,
        error: undefined,
      });
      mockApplyMigrations.mockResolvedValue({
        data: [{ id: '2024-01-03T00:00:00.000Z', status: 'applied' }],
        error: undefined,
      });

      const result = await service.sync();

      expect(result).toEqual({
        migrationsApplied: 1,
        tablesCreated: [],
        tablesUpdated: [],
        tablesRemoved: ['deprecated_table'],
      });
    });

    it('applies rename migrations and tracks as updated', async () => {
      const migrations: Migration[] = [
        {
          changeType: 'rename',
          id: '2024-01-04T00:00:00.000Z',
          tableId: 'old_name',
          nextTableId: 'new_name',
        },
      ];

      mockMigrations.mockResolvedValue({
        data: migrations,
        error: undefined,
      });
      mockApplyMigrations.mockResolvedValue({
        data: [{ id: '2024-01-04T00:00:00.000Z', status: 'applied' }],
        error: undefined,
      });

      const result = await service.sync();

      expect(result).toEqual({
        migrationsApplied: 1,
        tablesCreated: [],
        tablesUpdated: ['old_name → new_name'],
        tablesRemoved: [],
      });
    });

    it('handles skipped migrations', async () => {
      const migrations: Migration[] = [
        {
          changeType: 'init',
          id: '2024-01-01T00:00:00.000Z',
          tableId: 'users',
          hash: 'abc123',
          schema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
            required: [],
          },
        },
      ];

      mockMigrations.mockResolvedValue({
        data: migrations,
        error: undefined,
      });
      mockApplyMigrations.mockResolvedValue({
        data: [{ id: '2024-01-01T00:00:00.000Z', status: 'skipped' }],
        error: undefined,
      });

      const result = await service.sync();

      expect(result).toEqual({
        migrationsApplied: 0,
        tablesCreated: [],
        tablesUpdated: [],
        tablesRemoved: [],
      });
    });

    it('applies multiple migrations in sequence', async () => {
      const migrations: Migration[] = [
        {
          changeType: 'init',
          id: '2024-01-01T00:00:00.000Z',
          tableId: 'users',
          hash: 'abc',
          schema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
            required: [],
          },
        },
        {
          changeType: 'init',
          id: '2024-01-02T00:00:00.000Z',
          tableId: 'posts',
          hash: 'def',
          schema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
            required: [],
          },
        },
        {
          changeType: 'update',
          id: '2024-01-03T00:00:00.000Z',
          tableId: 'users',
          hash: 'ghi',
          patches: [],
        },
      ];

      mockMigrations.mockResolvedValue({
        data: migrations,
        error: undefined,
      });
      mockApplyMigrations
        .mockResolvedValueOnce({
          data: [{ id: '2024-01-01T00:00:00.000Z', status: 'applied' }],
          error: undefined,
        })
        .mockResolvedValueOnce({
          data: [{ id: '2024-01-02T00:00:00.000Z', status: 'applied' }],
          error: undefined,
        })
        .mockResolvedValueOnce({
          data: [{ id: '2024-01-03T00:00:00.000Z', status: 'applied' }],
          error: undefined,
        });

      const result = await service.sync();

      expect(result).toEqual({
        migrationsApplied: 3,
        tablesCreated: ['users', 'posts'],
        tablesUpdated: ['users'],
        tablesRemoved: [],
      });
      expect(mockApplyMigrations).toHaveBeenCalledTimes(3);
    });

    it('throws error when getting migrations fails', async () => {
      mockMigrations.mockResolvedValue({
        data: undefined,
        error: { message: 'Network error' },
      });

      await expect(service.sync()).rejects.toThrow('Failed to get migrations');
    });

    it('throws error when applying migrations fails', async () => {
      const migrations: Migration[] = [
        {
          changeType: 'init',
          id: '2024-01-01T00:00:00.000Z',
          tableId: 'users',
          hash: 'abc123',
          schema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
            required: [],
          },
        },
      ];

      mockMigrations.mockResolvedValue({
        data: migrations,
        error: undefined,
      });
      mockApplyMigrations.mockResolvedValue({
        data: undefined,
        error: { message: 'Permission denied' },
      });

      await expect(service.sync()).rejects.toThrow('Failed to apply migration');
    });

    it('throws error when migration status is failed', async () => {
      const migrations: Migration[] = [
        {
          changeType: 'init',
          id: '2024-01-01T00:00:00.000Z',
          tableId: 'users',
          hash: 'abc123',
          schema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
            required: [],
          },
        },
      ];

      mockMigrations.mockResolvedValue({
        data: migrations,
        error: undefined,
      });
      mockApplyMigrations.mockResolvedValue({
        data: [
          {
            id: '2024-01-01T00:00:00.000Z',
            status: 'failed',
            error: 'Table already exists',
          },
        ],
        error: undefined,
      });

      await expect(service.sync()).rejects.toThrow(
        'Migration 2024-01-01T00:00:00.000Z failed: Table already exists',
      );
    });
  });

  describe('sync with dryRun', () => {
    it('returns analysis without applying migrations', async () => {
      const migrations: Migration[] = [
        {
          changeType: 'init',
          id: '2024-01-01T00:00:00.000Z',
          tableId: 'users',
          hash: 'abc',
          schema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
            required: [],
          },
        },
        {
          changeType: 'update',
          id: '2024-01-02T00:00:00.000Z',
          tableId: 'posts',
          hash: 'def',
          patches: [],
        },
        {
          changeType: 'remove',
          id: '2024-01-03T00:00:00.000Z',
          tableId: 'deprecated',
        },
        {
          changeType: 'rename',
          id: '2024-01-04T00:00:00.000Z',
          tableId: 'old',
          nextTableId: 'new',
        },
      ];

      mockMigrations.mockResolvedValue({
        data: migrations,
        error: undefined,
      });

      const result = await service.sync(true);

      expect(result).toEqual({
        migrationsApplied: 0,
        tablesCreated: ['users'],
        tablesUpdated: ['posts', 'old → new'],
        tablesRemoved: ['deprecated'],
      });
      expect(mockApplyMigrations).not.toHaveBeenCalled();
    });

    it('returns empty result for dry run with no migrations', async () => {
      mockMigrations.mockResolvedValue({
        data: [],
        error: undefined,
      });

      const result = await service.sync(true);

      expect(result).toEqual({
        migrationsApplied: 0,
        tablesCreated: [],
        tablesUpdated: [],
        tablesRemoved: [],
      });
    });
  });
});
