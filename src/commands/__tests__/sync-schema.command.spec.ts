/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SyncSchemaCommand } from '../sync-schema.command';
import {
  SyncApiService,
  ConnectionInfo,
} from '../../services/sync-api.service';
import { SyncSchemaService } from '../../services/sync-schema.service';
import {
  UrlBuilderService,
  RevisiumUrlComplete,
  AuthCredentials,
} from '../../services/url-builder.service';
import { CommitRevisionService } from '../../services/commit-revision.service';

describe('SyncSchemaCommand', () => {
  let command: SyncSchemaCommand;
  let configServiceMock: jest.Mocked<ConfigService>;
  let urlBuilderMock: jest.Mocked<UrlBuilderService>;
  let syncApiMock: jest.Mocked<SyncApiService>;
  let syncSchemaMock: jest.Mocked<SyncSchemaService>;
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
      sync: jest.fn().mockResolvedValue({
        migrationsApplied: 0,
        tablesCreated: [],
        tablesUpdated: [],
        tablesRemoved: [],
      }),
    } as unknown as jest.Mocked<SyncSchemaService>;

    commitRevisionMock = {
      handleCommitFlowForSync: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CommitRevisionService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncSchemaCommand,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: UrlBuilderService, useValue: urlBuilderMock },
        { provide: SyncApiService, useValue: syncApiMock },
        { provide: SyncSchemaService, useValue: syncSchemaMock },
        { provide: CommitRevisionService, useValue: commitRevisionMock },
      ],
    }).compile();

    command = module.get<SyncSchemaCommand>(SyncSchemaCommand);
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

    it('performs sync operation', async () => {
      await command.run([], {});

      expect(syncSchemaMock.sync).toHaveBeenCalledWith(undefined);
    });

    it('logs message when schema is already in sync', async () => {
      syncSchemaMock.sync.mockResolvedValue({
        migrationsApplied: 0,
        tablesCreated: [],
        tablesUpdated: [],
        tablesRemoved: [],
      });

      await command.run([], {});

      expect(console.log).toHaveBeenCalledWith(
        '\n\u2705 Schema is already in sync - no changes needed',
      );
    });

    it('logs summary when migrations applied', async () => {
      syncSchemaMock.sync.mockResolvedValue({
        migrationsApplied: 3,
        tablesCreated: ['users', 'posts'],
        tablesUpdated: ['comments'],
        tablesRemoved: [],
      });

      await command.run([], {});

      expect(console.log).toHaveBeenCalledWith('\n\u2705 Schema sync complete');
      expect(console.log).toHaveBeenCalledWith('   Migrations applied: 3');
      expect(console.log).toHaveBeenCalledWith(
        '   Tables created: users, posts',
      );
      expect(console.log).toHaveBeenCalledWith('   Tables updated: comments');
    });

    it('logs removed tables', async () => {
      syncSchemaMock.sync.mockResolvedValue({
        migrationsApplied: 1,
        tablesCreated: [],
        tablesUpdated: [],
        tablesRemoved: ['old_table'],
      });

      await command.run([], {});

      expect(console.log).toHaveBeenCalledWith('   Tables removed: old_table');
    });

    it('performs dry run without committing', async () => {
      syncSchemaMock.sync.mockResolvedValue({
        migrationsApplied: 5,
        tablesCreated: [],
        tablesUpdated: [],
        tablesRemoved: [],
      });

      await command.run([], { dryRun: true });

      expect(syncSchemaMock.sync).toHaveBeenCalledWith(true);
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

      await command.run([], { commit: true });

      expect(commitRevisionMock.handleCommitFlowForSync).toHaveBeenCalledWith(
        expect.anything(),
        'Applied',
        2,
      );
    });

    it('does not commit when no migrations applied', async () => {
      syncSchemaMock.sync.mockResolvedValue({
        migrationsApplied: 0,
        tablesCreated: [],
        tablesUpdated: [],
        tablesRemoved: [],
      });

      await command.run([], { commit: true });

      expect(commitRevisionMock.handleCommitFlowForSync).not.toHaveBeenCalled();
    });

    it('reads environment variables for source config', async () => {
      configServiceMock.get.mockImplementation((key: string) => {
        const envVars: Record<string, string> = {
          REVISIUM_SOURCE_URL: 'env-source-url',
          REVISIUM_SOURCE_TOKEN: 'env-token',
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
        }),
      );
    });

    it('reads environment variables for target config', async () => {
      configServiceMock.get.mockImplementation((key: string) => {
        const envVars: Record<string, string> = {
          REVISIUM_TARGET_URL: 'env-target-url',
          REVISIUM_TARGET_API_KEY: 'env-apikey',
        };
        return envVars[key];
      });

      await command.run([], {});

      expect(urlBuilderMock.parseAndComplete).toHaveBeenCalledWith(
        undefined,
        'target',
        expect.objectContaining({
          url: 'env-target-url',
          apikey: 'env-apikey',
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

    it('parses commit option with no value', () => {
      expect(command.parseCommit()).toBe(true);
    });

    it('parses commit option with true', () => {
      expect(command.parseCommit('true')).toBe(true);
    });

    it('parses commit option with false', () => {
      expect(command.parseCommit('false')).toBe(false);
    });

    it('parses dry-run option with no value', () => {
      expect(command.parseDryRun()).toBe(true);
    });

    it('parses dry-run option with true', () => {
      expect(command.parseDryRun('true')).toBe(true);
    });

    it('parses dry-run option with false', () => {
      expect(command.parseDryRun('false')).toBe(false);
    });

    it('throws error for invalid boolean value', () => {
      expect(() => command.parseCommit('invalid')).toThrow(
        'Invalid boolean value',
      );
    });
  });
});
