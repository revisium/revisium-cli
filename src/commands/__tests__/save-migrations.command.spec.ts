import { Test, TestingModule } from '@nestjs/testing';
import { writeFile } from 'fs/promises';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import * as os from 'os';
import { SaveMigrationsCommand } from '../save-migrations.command';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';

jest.mock('fs/promises');

const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockRm = rm as jest.MockedFunction<typeof rm>;

describe('SaveMigrationsCommand', () => {
  it('throws error when file option is missing', async () => {
    await expect(command.run([])).rejects.toThrow(
      'Error: --file option is required',
    );
  });

  it('authenticates before fetching migrations', async () => {
    setupSuccessfulApiCalls();

    await command.run([], { file: 'migrations.json' });

    expect(coreApiServiceFake.login).toHaveBeenCalledTimes(1);
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

    expect(draftRevisionServiceFake.getDraftRevisionId).toHaveBeenCalledWith(
      options,
    );
  });

  it('fetches migrations for resolved revision', async () => {
    setupSuccessfulApiCalls('revision-789');

    await command.run([], { file: 'migrations.json' });

    expect(coreApiServiceFake.api.migrations).toHaveBeenCalledWith(
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

  it('propagates authentication errors', async () => {
    const authError = new Error('Invalid credentials');
    coreApiServiceFake.login.mockRejectedValue(authError);

    await expect(command.run([], { file: 'migrations.json' })).rejects.toThrow(
      'Invalid credentials',
    );
  });

  it('propagates revision resolution errors', async () => {
    coreApiServiceFake.login.mockResolvedValue(undefined);
    const revisionError = new Error('Project not found');
    draftRevisionServiceFake.getDraftRevisionId.mockRejectedValue(
      revisionError,
    );

    await expect(command.run([], { file: 'migrations.json' })).rejects.toThrow(
      'Project not found',
    );
  });

  it('handles API fetch errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    coreApiServiceFake.login.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    const apiError = new Error('Network timeout');
    coreApiServiceFake.api.migrations.mockRejectedValue(apiError);

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
    coreApiServiceFake.login.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
    coreApiServiceFake.api.migrations.mockRejectedValue('String error');

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
    coreApiServiceFake.login.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
    coreApiServiceFake.api.migrations.mockResolvedValue({ data: [] });

    await command.run([], { file: 'empty-migrations.json' });

    expect(mockWriteFile).toHaveBeenCalledWith(
      'empty-migrations.json',
      JSON.stringify([], null, 2),
      'utf-8',
    );
  });

  it('formats JSON with proper indentation', async () => {
    coreApiServiceFake.login.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
    coreApiServiceFake.api.migrations.mockResolvedValue({
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

  const coreApiServiceFake = {
    login: jest.fn(),
    api: {
      migrations: jest.fn(),
    },
  };

  const draftRevisionServiceFake = {
    getDraftRevisionId: jest.fn(),
  };

  const setupSuccessfulApiCalls = (revisionId = 'revision-123') => {
    coreApiServiceFake.login.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(revisionId);
    coreApiServiceFake.api.migrations.mockResolvedValue(mockMigrationsResponse);
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaveMigrationsCommand,
        { provide: CoreApiService, useValue: coreApiServiceFake },
        { provide: DraftRevisionService, useValue: draftRevisionServiceFake },
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
