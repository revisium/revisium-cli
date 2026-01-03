import { Test, TestingModule } from '@nestjs/testing';
import { writeFile } from 'node:fs/promises';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as os from 'os';
import { SaveMigrationsCommand } from '../save-migrations.command';
import { ConnectionService } from 'src/services/connection.service';

jest.mock('node:fs/promises');

const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockRm = rm as jest.MockedFunction<typeof rm>;

describe('SaveMigrationsCommand', () => {
  it('throws error when file option is missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await expect(command.run([], {} as any)).rejects.toThrow(
      'Error: --file option is required',
    );
  });

  it('authenticates before fetching migrations', async () => {
    setupSuccessfulApiCalls();

    await command.run([], {
      file: 'migrations.json',
      url: 'http://localhost:8000',
    });

    expect(connectionServiceFake.connect).toHaveBeenCalledTimes(1);
    expect(connectionServiceFake.connect).toHaveBeenNthCalledWith(1, {
      file: 'migrations.json',
      url: 'http://localhost:8000',
    });
  });

  it('resolves revision ID from options', async () => {
    setupSuccessfulApiCalls('revision-456');

    const options = {
      file: 'migrations.json',
      organization: 'test-org',
      project: 'test-project',
      branch: 'test-branch',
    };

    await command.run([], options);

    expect(connectionServiceFake.connect).toHaveBeenCalledWith(options);
  });

  it('fetches migrations for resolved revision', async () => {
    setupSuccessfulApiCalls('revision-789');

    await command.run([], { file: 'migrations.json' });

    expect(connectionServiceFake.api.migrations).toHaveBeenCalledWith(
      'revision-789',
    );
  });

  it('writes migrations data to specified file', async () => {
    setupSuccessfulApiCalls();

    const filePath = join(testDir, 'output.json');

    await command.run([], { file: filePath });

    expect(mockWriteFile).toHaveBeenCalledWith(
      filePath,
      JSON.stringify(mockMigrationsResponse.data, null, 2),
      'utf-8',
    );
  });

  it('logs success message with file path', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulApiCalls();

    const filePath = 'test-migrations.json';

    await command.run([], { file: filePath });

    expect(consoleSpy).toHaveBeenCalledWith(
      `✅ Save migrations to: ${filePath}`,
    );

    consoleSpy.mockRestore();
  });

  it('handles API fetch errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    connectionServiceFake.connect.mockResolvedValue(undefined);

    const apiError = new Error('Network timeout');
    connectionServiceFake.api.migrations.mockRejectedValue(apiError);

    await expect(command.run([], { file: 'migrations.json' })).rejects.toThrow(
      'Network timeout',
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error reading or parsing file:',
      'Network timeout',
    );

    consoleErrorSpy.mockRestore();
  });

  it('handles file write errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    setupSuccessfulApiCalls();

    const writeError = new Error('Permission denied');
    mockWriteFile.mockRejectedValue(writeError);

    await expect(
      command.run([], { file: '/readonly/path/migrations.json' }),
    ).rejects.toThrow('Permission denied');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error reading or parsing file:',
      'Permission denied',
    );

    consoleErrorSpy.mockRestore();
  });

  it('handles non-Error exceptions', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    connectionServiceFake.connect.mockResolvedValue(undefined);
    connectionServiceFake.api.migrations.mockRejectedValue('String error');

    await expect(command.run([], { file: 'migrations.json' })).rejects.toBe(
      'String error',
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error reading or parsing file:',
      'String error',
    );

    consoleErrorSpy.mockRestore();
  });

  it('processes empty migrations array', async () => {
    connectionServiceFake.connect.mockResolvedValue(undefined);
    connectionServiceFake.api.migrations.mockResolvedValue({ data: [] });

    await command.run([], { file: 'empty-migrations.json' });

    expect(mockWriteFile).toHaveBeenCalledWith(
      'empty-migrations.json',
      JSON.stringify([], null, 2),
      'utf-8',
    );
  });

  it('formats JSON with proper indentation', async () => {
    connectionServiceFake.connect.mockResolvedValue(undefined);
    connectionServiceFake.api.migrations.mockResolvedValue({
      data: [
        {
          id: '2024-01-01T00:00:00.000Z',
          changeType: 'init',
          tableId: 'users',
        },
      ],
    });

    await command.run([], { file: 'formatted.json' });

    const expectedJson = JSON.stringify(
      [
        {
          id: '2024-01-01T00:00:00.000Z',
          changeType: 'init',
          tableId: 'users',
        },
      ],
      null,
      2,
    );

    expect(mockWriteFile).toHaveBeenCalledWith(
      'formatted.json',
      expectedJson,
      'utf-8',
    );
  });

  it('parses file option correctly', () => {
    const result = command.parseFile('test-file.json');
    expect(result).toBe('test-file.json');
  });

  let command: SaveMigrationsCommand;
  let testDir: string;

  const mockMigrationsResponse = {
    data: [
      {
        id: '2024-01-01T00:00:00.000Z',
        changeType: 'init',
        tableId: 'users',
        hash: 'abc123',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    ],
  };

  const connectionServiceFake = {
    connect: jest.fn(),
    revisionId: 'revision-123',
    api: {
      migrations: jest.fn(),
    },
  };

  const setupSuccessfulApiCalls = (revisionId = 'revision-123') => {
    connectionServiceFake.connect.mockResolvedValue(undefined);
    connectionServiceFake.revisionId = revisionId;
    connectionServiceFake.api.migrations.mockResolvedValue(
      mockMigrationsResponse,
    );
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaveMigrationsCommand,
        { provide: ConnectionService, useValue: connectionServiceFake },
      ],
    }).compile();

    command = module.get<SaveMigrationsCommand>(SaveMigrationsCommand);

    testDir = join(os.tmpdir(), `save-migrations-test-${Date.now()}`);

    jest.clearAllMocks();
    mockWriteFile.mockResolvedValue();
    mockMkdir.mockResolvedValue(undefined);
    mockRm.mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
