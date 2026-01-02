/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SyncAllCommand } from '../sync-all.command';
import {
  SyncApiService,
  ConnectionInfo,
} from '../../services/sync-api.service';
import { SyncSchemaService } from '../../services/sync-schema.service';
import { SyncDataService } from '../../services/sync-data.service';
import {
  UrlBuilderService,
  RevisiumUrlComplete,
  AuthCredentials,
} from '../../services/url-builder.service';
import { CommitRevisionService } from '../../services/commit-revision.service';

describe('SyncAllCommand', () => {
  let command: SyncAllCommand;
  let configServiceMock: jest.Mocked<ConfigService>;
  let urlBuilderMock: jest.Mocked<UrlBuilderService>;
  let syncApiMock: jest.Mocked<SyncApiService>;
  let syncSchemaMock: jest.Mocked<SyncSchemaService>;
  let syncDataMock: jest.Mocked<SyncDataService>;
  let commitRevisionMock: jest.Mocked<CommitRevisionService>;

  const createMockUrl = (): RevisiumUrlComplete => ({
    baseUrl: 'https://api.example.com',
    auth: { method: 'token', token: 'test-token' } as AuthCredentials,
    organization: 'test-org',
    project: 'test-project',
    branch: 'master',
    revision: 'draft',
  });

  const createMockConnectionInfo = (): ConnectionInfo => ({
    url: createMockUrl(),
    client: {} as ConnectionInfo['client'],
    revisionId: 'rev-123',
    headRevisionId: 'head-123',
    draftRevisionId: 'draft-123',
  });

  const createEmptySchemaResult = () => ({
    migrationsApplied: 0,
    tablesCreated: [],
    tablesUpdated: [],
    tablesRemoved: [],
  });

  const createEmptyDataResult = () => ({
    tables: [],
    totalRowsCreated: 0,
    totalRowsUpdated: 0,
    totalRowsSkipped: 0,
    totalErrors: 0,
  });

  beforeEach(async () => {
    configServiceMock = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as jest.Mocked<ConfigService>;

    urlBuilderMock = {
      parseAndComplete: jest.fn().mockResolvedValue(createMockUrl()),
      formatAsRevisiumUrl: jest.fn().mockReturnValue('revisium://test'),
    } as unknown as jest.Mocked<UrlBuilderService>;

    syncApiMock = {
      connectSource: jest.fn().mockResolvedValue(undefined),
      connectTarget: jest.fn().mockResolvedValue(undefined),
      get source() {
        return createMockConnectionInfo();
      },
      get target() {
        return createMockConnectionInfo();
      },
    } as unknown as jest.Mocked<SyncApiService>;

    syncSchemaMock = {
      sync: jest.fn().mockResolvedValue(createEmptySchemaResult()),
    } as unknown as jest.Mocked<SyncSchemaService>;

    syncDataMock = {
      sync: jest.fn().mockResolvedValue(createEmptyDataResult()),
    } as unknown as jest.Mocked<SyncDataService>;

    commitRevisionMock = {
      handleCommitFlowForSync: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CommitRevisionService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncAllCommand,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: UrlBuilderService, useValue: urlBuilderMock },
        { provide: SyncApiService, useValue: syncApiMock },
        { provide: SyncSchemaService, useValue: syncSchemaMock },
        { provide: SyncDataService, useValue: syncDataMock },
        { provide: CommitRevisionService, useValue: commitRevisionMock },
      ],
    }).compile();

    command = module.get<SyncAllCommand>(SyncAllCommand);
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('run', () => {
    it('connects to source and target', async () => {
      await command.run([], { source: 'source-url', target: 'target-url' });

      expect(urlBuilderMock.parseAndComplete).toHaveBeenCalledTimes(2);
      expect(syncApiMock.connectSource).toHaveBeenCalled();
      expect(syncApiMock.connectTarget).toHaveBeenCalled();
    });

    it('performs both schema and data sync', async () => {
      await command.run([], {});

      expect(syncSchemaMock.sync).toHaveBeenCalledWith(undefined);
      expect(syncDataMock.sync).toHaveBeenCalledWith({
        dryRun: undefined,
        tables: undefined,
        batchSize: undefined,
      });
    });

    it('parses tables option as comma-separated list', async () => {
      await command.run([], { tables: 'users, posts, comments' });

      expect(syncDataMock.sync).toHaveBeenCalledWith({
        dryRun: undefined,
        tables: ['users', 'posts', 'comments'],
        batchSize: undefined,
      });
    });

    it('passes batch size option', async () => {
      await command.run([], { batchSize: 50 });

      expect(syncDataMock.sync).toHaveBeenCalledWith({
        dryRun: undefined,
        tables: undefined,
        batchSize: 50,
      });
    });

    it('logs message when everything is already in sync', async () => {
      syncSchemaMock.sync.mockResolvedValue(createEmptySchemaResult());
      syncDataMock.sync.mockResolvedValue(createEmptyDataResult());

      await command.run([], {});

      expect(console.log).toHaveBeenCalledWith(
        '\n\u2705 Everything is already in sync - no changes needed',
      );
    });

    it('logs full summary when changes made', async () => {
      syncSchemaMock.sync.mockResolvedValue({
        migrationsApplied: 2,
        tablesCreated: ['users'],
        tablesUpdated: ['posts'],
        tablesRemoved: [],
      });
      syncDataMock.sync.mockResolvedValue({
        tables: [],
        totalRowsCreated: 10,
        totalRowsUpdated: 5,
        totalRowsSkipped: 3,
        totalErrors: 0,
      });

      await command.run([], {});

      expect(console.log).toHaveBeenCalledWith('\n\u2705 Full sync complete');
      expect(console.log).toHaveBeenCalledWith('\n\ud83d\udcca Summary:');
      expect(console.log).toHaveBeenCalledWith('   Schema:');
      expect(console.log).toHaveBeenCalledWith('     Migrations applied: 2');
      expect(console.log).toHaveBeenCalledWith('     Tables created: users');
      expect(console.log).toHaveBeenCalledWith('     Tables updated: posts');
      expect(console.log).toHaveBeenCalledWith('   Data:');
      expect(console.log).toHaveBeenCalledWith('     Rows created: 10');
      expect(console.log).toHaveBeenCalledWith('     Rows updated: 5');
      expect(console.log).toHaveBeenCalledWith('     Rows skipped: 3');
    });

    it('logs removed tables in summary', async () => {
      syncSchemaMock.sync.mockResolvedValue({
        migrationsApplied: 1,
        tablesCreated: [],
        tablesUpdated: [],
        tablesRemoved: ['old_table'],
      });
      syncDataMock.sync.mockResolvedValue({
        tables: [],
        totalRowsCreated: 0,
        totalRowsUpdated: 1,
        totalRowsSkipped: 0,
        totalErrors: 0,
      });

      await command.run([], {});

      expect(console.log).toHaveBeenCalledWith(
        '     Tables removed: old_table',
      );
    });

    it('logs errors in summary when present', async () => {
      syncSchemaMock.sync.mockResolvedValue(createEmptySchemaResult());
      syncDataMock.sync.mockResolvedValue({
        tables: [],
        totalRowsCreated: 5,
        totalRowsUpdated: 0,
        totalRowsSkipped: 0,
        totalErrors: 2,
      });

      await command.run([], {});

      expect(console.log).toHaveBeenCalledWith('     Errors: 2');
    });

    it('performs dry run without committing', async () => {
      syncSchemaMock.sync.mockResolvedValue({
        migrationsApplied: 5,
        tablesCreated: [],
        tablesUpdated: [],
        tablesRemoved: [],
      });
      syncDataMock.sync.mockResolvedValue({
        tables: [],
        totalRowsCreated: 10,
        totalRowsUpdated: 5,
        totalRowsSkipped: 0,
        totalErrors: 0,
      });

      await command.run([], { dryRun: true });

      expect(syncSchemaMock.sync).toHaveBeenCalledWith(true);
      expect(syncDataMock.sync).toHaveBeenCalledWith({
        dryRun: true,
        tables: undefined,
        batchSize: undefined,
      });
      expect(console.log).toHaveBeenCalledWith(
        '\n\ud83d\udccb Dry run complete - no changes were made',
      );
      expect(commitRevisionMock.handleCommitFlowForSync).not.toHaveBeenCalled();
    });

    it('commits changes when commit option is true', async () => {
      syncSchemaMock.sync.mockResolvedValue({
        migrationsApplied: 2,
        tablesCreated: [],
        tablesUpdated: [],
        tablesRemoved: [],
      });
      syncDataMock.sync.mockResolvedValue({
        tables: [],
        totalRowsCreated: 5,
        totalRowsUpdated: 3,
        totalRowsSkipped: 0,
        totalErrors: 0,
      });

      await command.run([], { commit: true });

      expect(commitRevisionMock.handleCommitFlowForSync).toHaveBeenCalledWith(
        expect.anything(),
        'Synced',
        10, // 2 migrations + 5 created + 3 updated
      );
    });

    it('does not commit when no changes made', async () => {
      syncSchemaMock.sync.mockResolvedValue(createEmptySchemaResult());
      syncDataMock.sync.mockResolvedValue(createEmptyDataResult());

      await command.run([], { commit: true });

      expect(commitRevisionMock.handleCommitFlowForSync).not.toHaveBeenCalled();
    });

    it('reads environment variables for source config', async () => {
      configServiceMock.get.mockImplementation((key: string) => {
        const envVars: Record<string, string> = {
          REVISIUM_SOURCE_URL: 'env-source-url',
          REVISIUM_SOURCE_TOKEN: 'env-token',
          REVISIUM_SOURCE_API_KEY: 'env-apikey',
        };
        return envVars[key];
      });

      await command.run([], {});

      expect(urlBuilderMock.parseAndComplete).toHaveBeenCalledWith(
        undefined,
        'source',
        expect.objectContaining({
          url: 'env-source-url',
          token: 'env-token',
          apikey: 'env-apikey',
        }),
      );
    });

    it('reads environment variables for target config', async () => {
      configServiceMock.get.mockImplementation((key: string) => {
        const envVars: Record<string, string> = {
          REVISIUM_TARGET_URL: 'env-target-url',
          REVISIUM_TARGET_USERNAME: 'env-user',
          REVISIUM_TARGET_PASSWORD: 'env-pass',
        };
        return envVars[key];
      });

      await command.run([], {});

      expect(urlBuilderMock.parseAndComplete).toHaveBeenCalledWith(
        undefined,
        'target',
        expect.objectContaining({
          url: 'env-target-url',
          username: 'env-user',
          password: 'env-pass',
        }),
      );
    });
  });

  describe('option parsers', () => {
    it('parses source option', () => {
      expect(command.parseSource('my-source')).toBe('my-source');
    });

    it('parses target option', () => {
      expect(command.parseTarget('my-target')).toBe('my-target');
    });

    it('parses tables option', () => {
      expect(command.parseTables('users,posts')).toBe('users,posts');
    });

    it('parses batch-size option', () => {
      expect(command.parseBatchSize('50')).toBe(50);
    });

    it('throws error for invalid batch-size', () => {
      expect(() => command.parseBatchSize('0')).toThrow(
        'Batch size must be a positive integer',
      );
      expect(() => command.parseBatchSize('-1')).toThrow(
        'Batch size must be a positive integer',
      );
      expect(() => command.parseBatchSize('abc')).toThrow(
        'Batch size must be a positive integer',
      );
    });

    it('parses commit option with no value', () => {
      expect(command.parseCommit()).toBe(true);
    });

    it('parses commit option with true/false', () => {
      expect(command.parseCommit('true')).toBe(true);
      expect(command.parseCommit('false')).toBe(false);
    });

    it('parses dry-run option with no value', () => {
      expect(command.parseDryRun()).toBe(true);
    });

    it('parses dry-run option with true/false', () => {
      expect(command.parseDryRun('true')).toBe(true);
      expect(command.parseDryRun('false')).toBe(false);
    });

    it('throws error for invalid boolean value', () => {
      expect(() => command.parseCommit('invalid')).toThrow(
        'Invalid boolean value',
      );
    });
  });
});
