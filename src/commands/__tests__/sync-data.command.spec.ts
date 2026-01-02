/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SyncDataCommand } from '../sync-data.command';
import {
  SyncApiService,
  ConnectionInfo,
} from '../../services/sync-api.service';
import { SyncDataService } from '../../services/sync-data.service';
import {
  UrlBuilderService,
  RevisiumUrlComplete,
  AuthCredentials,
} from '../../services/url-builder.service';
import { CommitRevisionService } from '../../services/commit-revision.service';

describe('SyncDataCommand', () => {
  let command: SyncDataCommand;
  let configServiceMock: jest.Mocked<ConfigService>;
  let urlBuilderMock: jest.Mocked<UrlBuilderService>;
  let syncApiMock: jest.Mocked<SyncApiService>;
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

  const createEmptyResult = () => ({
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

    syncDataMock = {
      sync: jest.fn().mockResolvedValue(createEmptyResult()),
    } as unknown as jest.Mocked<SyncDataService>;

    commitRevisionMock = {
      handleCommitFlowForSync: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CommitRevisionService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncDataCommand,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: UrlBuilderService, useValue: urlBuilderMock },
        { provide: SyncApiService, useValue: syncApiMock },
        { provide: SyncDataService, useValue: syncDataMock },
        { provide: CommitRevisionService, useValue: commitRevisionMock },
      ],
    }).compile();

    command = module.get<SyncDataCommand>(SyncDataCommand);
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

    it('performs sync operation without tables filter', async () => {
      await command.run([], {});

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

    it('logs message when data is already in sync', async () => {
      syncDataMock.sync.mockResolvedValue(createEmptyResult());

      await command.run([], {});

      expect(console.log).toHaveBeenCalledWith(
        '\n\u2705 Data is already in sync - no changes needed',
      );
    });

    it('logs summary when rows synced', async () => {
      syncDataMock.sync.mockResolvedValue({
        tables: [
          {
            tableId: 'users',
            rowsCreated: 5,
            rowsUpdated: 3,
            rowsSkipped: 2,
            errors: 0,
          },
        ],
        totalRowsCreated: 5,
        totalRowsUpdated: 3,
        totalRowsSkipped: 2,
        totalErrors: 0,
      });

      await command.run([], {});

      expect(console.log).toHaveBeenCalledWith('\n\u2705 Data sync complete');
      expect(console.log).toHaveBeenCalledWith('   Rows created: 5');
      expect(console.log).toHaveBeenCalledWith('   Rows updated: 3');
      expect(console.log).toHaveBeenCalledWith('   Rows skipped: 2');
    });

    it('logs errors when present', async () => {
      syncDataMock.sync.mockResolvedValue({
        tables: [],
        totalRowsCreated: 5,
        totalRowsUpdated: 0,
        totalRowsSkipped: 0,
        totalErrors: 2,
      });

      await command.run([], {});

      expect(console.log).toHaveBeenCalledWith('   Errors: 2');
    });

    it('performs dry run without committing', async () => {
      syncDataMock.sync.mockResolvedValue({
        tables: [],
        totalRowsCreated: 10,
        totalRowsUpdated: 5,
        totalRowsSkipped: 0,
        totalErrors: 0,
      });

      await command.run([], { dryRun: true });

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
        8,
      );
    });

    it('does not commit when no changes made', async () => {
      syncDataMock.sync.mockResolvedValue(createEmptyResult());

      await command.run([], { commit: true });

      expect(commitRevisionMock.handleCommitFlowForSync).not.toHaveBeenCalled();
    });

    it('reads environment variables for source config', async () => {
      configServiceMock.get.mockImplementation((key: string) => {
        const envVars: Record<string, string> = {
          REVISIUM_SOURCE_URL: 'env-source-url',
          REVISIUM_SOURCE_USERNAME: 'env-user',
          REVISIUM_SOURCE_PASSWORD: 'env-pass',
        };
        return envVars[key];
      });

      await command.run([], {});

      expect(urlBuilderMock.parseAndComplete).toHaveBeenCalledWith(
        undefined,
        'source',
        expect.objectContaining({
          url: 'env-source-url',
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
