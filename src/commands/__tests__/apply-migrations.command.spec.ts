/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { readFile } from 'node:fs/promises';
import { ApplyMigrationsCommand } from '../apply-migrations.command';
import { ConnectionService } from 'src/services/connection.service';
import { JsonValidatorService } from 'src/services/json-validator.service';
import { CommitRevisionService } from 'src/services/commit-revision.service';

jest.mock('node:fs/promises');

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;

describe('ApplyMigrationsCommand', () => {
  it('throws error when file option is missing', async () => {
    await expect(command.run([], {} as any)).rejects.toThrow(
      'Error: --file option is required',
    );
  });

  it('connects before applying migrations', async () => {
    setupSuccessfulFlow();

    await command.run([], { file: 'migrations.json' });

    expect(connectionServiceFake.connect).toHaveBeenCalledWith({
      file: 'migrations.json',
    });
  });

  it('validates JSON file before processing', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();

    await command.run([], { file: 'test-migrations.json' });

    expect(mockReadFile).toHaveBeenCalledWith('test-migrations.json', 'utf-8');
    expect(jsonValidatorServiceFake.validateMigration).toHaveBeenCalledWith(
      mockMigrations,
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '📋 Validating migration file: test-migrations.json',
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '✅ Migration file validation passed',
    );

    consoleSpy.mockRestore();
  });

  it('resolves revision ID from options', async () => {
    setupSuccessfulFlow();
    const options = {
      file: 'migrations.json',
      organization: 'test-org',
      project: 'test-project',
      branch: 'test-branch',
    };

    await command.run([], options);

    expect(connectionServiceFake.connect).toHaveBeenCalledWith(options);
  });

  it('applies migrations one by one', async () => {
    setupSuccessfulFlow();

    await command.run([], { file: 'migrations.json' });

    expect(connectionServiceFake.api.applyMigrations).toHaveBeenCalledTimes(2);
    expect(connectionServiceFake.api.applyMigrations).toHaveBeenNthCalledWith(
      1,
      'revision-123',
      [mockMigrations[0]],
    );
    expect(connectionServiceFake.api.applyMigrations).toHaveBeenNthCalledWith(
      2,
      'revision-123',
      [mockMigrations[1]],
    );
  });

  it('logs success when no migrations to apply', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    connectionServiceFake.connect.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue('[]');
    jsonValidatorServiceFake.validateMigration.mockReturnValue([]);

    await command.run([], { file: 'empty-migrations.json' });

    expect(consoleSpy).toHaveBeenCalledWith(
      '✅ No migrations to apply - all migrations are up to date',
    );

    consoleSpy.mockRestore();
  });

  it('logs migration count before applying', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();

    await command.run([], { file: 'migrations.json' });

    expect(consoleSpy).toHaveBeenCalledWith('🚀 Applying 2 migrations...');

    consoleSpy.mockRestore();
  });

  it('handles successful migration application', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();

    await command.run([], { file: 'migrations.json' });

    expect(consoleSpy).toHaveBeenCalledWith(
      '✅ Migration applied: migration-1',
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '✅ Migration applied: migration-2',
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '✅ Successfully applied 2 migrations',
    );

    consoleSpy.mockRestore();
  });

  it('handles skipped migrations', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    connectionServiceFake.connect.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(JSON.stringify(mockMigrations));
    jsonValidatorServiceFake.validateMigration.mockReturnValue(mockMigrations);
    connectionServiceFake.api.applyMigrations.mockResolvedValue({
      data: [{ status: 'skipped', id: 'migration-1' }],
    });

    await command.run([], { file: 'migrations.json' });

    expect(consoleSpy).toHaveBeenCalledWith(
      '⏭️  Migration already applied: migration-1',
    );

    consoleSpy.mockRestore();
  });

  it('handles failed migrations and stops processing', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    connectionServiceFake.connect.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(JSON.stringify(mockMigrations));
    jsonValidatorServiceFake.validateMigration.mockReturnValue(mockMigrations);
    connectionServiceFake.api.applyMigrations.mockResolvedValueOnce({
      data: [
        {
          status: 'failed',
          id: 'migration-1',
          error: 'Table already exists',
        },
      ],
    });

    await expect(command.run([], { file: 'migrations.json' })).rejects.toThrow(
      'Migration migration-1 failed: Table already exists',
    );

    expect(consoleSpy).toHaveBeenCalledWith('❌ Migration failed:', {
      status: 'failed',
      id: 'migration-1',
      error: 'Table already exists',
    });
    expect(connectionServiceFake.api.applyMigrations).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('logs final success message', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();

    await command.run([], { file: 'migrations.json' });

    expect(consoleSpy).toHaveBeenCalledWith(
      '✅ Successfully applied 2 migrations',
    );

    consoleSpy.mockRestore();
  });

  it('handles file read errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    connectionServiceFake.connect.mockResolvedValue(undefined);
    mockReadFile.mockRejectedValue(new Error('File not found'));

    await expect(command.run([], { file: 'nonexistent.json' })).rejects.toThrow(
      'File not found',
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error reading or parsing file:',
      'File not found',
    );

    consoleErrorSpy.mockRestore();
  });

  it('handles invalid JSON gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    connectionServiceFake.connect.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue('invalid json content');

    await expect(command.run([], { file: 'invalid.json' })).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error reading or parsing file:',
      expect.stringContaining('Unexpected token'),
    );

    consoleErrorSpy.mockRestore();
  });

  it('handles API errors during migration application', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    connectionServiceFake.connect.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(JSON.stringify(mockMigrations));
    jsonValidatorServiceFake.validateMigration.mockReturnValue(mockMigrations);

    const apiError = new Error('Network timeout');
    connectionServiceFake.api.applyMigrations.mockRejectedValue(apiError);

    await expect(command.run([], { file: 'migrations.json' })).rejects.toThrow(
      'Network timeout',
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Migration process failed: Network timeout',
    );

    consoleErrorSpy.mockRestore();
  });

  it('parses file option correctly', () => {
    const result = command.parseFile('test-migrations.json');
    expect(result).toBe('test-migrations.json');
  });

  it('parses commit option correctly', () => {
    expect(command.parseCommit('true')).toBe(true);
    expect(command.parseCommit('false')).toBe(false);
    expect(command.parseCommit()).toBe(true);
  });

  describe('with commit option', () => {
    it('calls commitRevisionService when commit is true', async () => {
      setupSuccessfulFlow();
      commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

      await command.run([], { file: 'migrations.json', commit: true });

      expect(commitRevisionServiceFake.handleCommitFlow).toHaveBeenCalledWith(
        true,
        'Applied',
        2,
      );
    });

    it('calls commitRevisionService when commit is false', async () => {
      setupSuccessfulFlow();
      commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

      await command.run([], { file: 'migrations.json', commit: false });

      expect(commitRevisionServiceFake.handleCommitFlow).toHaveBeenCalledWith(
        false,
        'Applied',
        2,
      );
    });

    it('calls commitRevisionService with zero changes when no migrations', async () => {
      connectionServiceFake.connect.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('[]');
      jsonValidatorServiceFake.validateMigration.mockReturnValue([]);
      commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

      await command.run([], { file: 'empty-migrations.json', commit: true });

      expect(commitRevisionServiceFake.handleCommitFlow).toHaveBeenCalledWith(
        true,
        'Applied',
        0,
      );
    });
  });

  let command: ApplyMigrationsCommand;

  const mockMigrations = [
    {
      id: 'migration-1',
      changeType: 'init',
      tableId: 'users',
      hash: 'hash1',
      schema: { type: 'object', properties: { name: { type: 'string' } } },
    },
    {
      id: 'migration-2',
      changeType: 'update',
      tableId: 'users',
      hash: 'hash2',
      patches: [
        { op: 'add', path: '/properties/age', value: { type: 'number' } },
      ],
    },
  ];

  const connectionServiceFake = {
    connect: jest.fn(),
    draftRevisionId: 'revision-123',
    api: {
      applyMigrations: jest.fn(),
    },
  };

  const jsonValidatorServiceFake = {
    validateMigration: jest.fn(),
  };

  const commitRevisionServiceFake = {
    handleCommitFlow: jest.fn(),
  };

  const setupSuccessfulFlow = () => {
    connectionServiceFake.connect.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(JSON.stringify(mockMigrations));
    jsonValidatorServiceFake.validateMigration.mockReturnValue(mockMigrations);
    connectionServiceFake.api.applyMigrations
      .mockResolvedValueOnce({
        data: [{ status: 'applied', id: 'migration-1' }],
      })
      .mockResolvedValueOnce({
        data: [{ status: 'applied', id: 'migration-2' }],
      });
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplyMigrationsCommand,
        { provide: ConnectionService, useValue: connectionServiceFake },
        { provide: JsonValidatorService, useValue: jsonValidatorServiceFake },
        {
          provide: CommitRevisionService,
          useValue: commitRevisionServiceFake,
        },
      ],
    }).compile();

    command = module.get<ApplyMigrationsCommand>(ApplyMigrationsCommand);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
