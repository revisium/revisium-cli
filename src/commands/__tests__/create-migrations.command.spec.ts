/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { readdir, readFile, writeFile } from 'fs/promises';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import * as os from 'os';
import { CreateMigrationsCommand } from '../create-migrations.command';
import { JsonValidatorService } from 'src/services/json-validator.service';
import { TableDependencyService } from 'src/services/table-dependency.service';

jest.mock('fs/promises');

const mockReaddir = readdir as jest.MockedFunction<typeof readdir>;
const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockRm = rm as jest.MockedFunction<typeof rm>;

describe('CreateMigrationsCommand', () => {
  it('throws error when schemas-folder option is missing', async () => {
    await expect(
      command.run([], { file: 'migrations.json' } as any),
    ).rejects.toThrow('Error: --schemas-folder option is required');
  });

  it('throws error when file option is missing', async () => {
    await expect(
      command.run([], { schemasFolder: './schemas' } as any),
    ).rejects.toThrow('Error: --file option is required');
  });

  it('loads schemas from folder and creates migrations', async () => {
    setupSuccessfulFlow();

    await command.run([], {
      schemasFolder: 'test-schemas',
      file: 'test-migrations.json',
    });

    expect(mockReaddir).toHaveBeenCalledWith('test-schemas');
    expect(mockReadFile).toHaveBeenCalledWith(
      join('test-schemas', 'users.json'),
      'utf-8',
    );
    expect(mockReadFile).toHaveBeenCalledWith(
      join('test-schemas', 'posts.json'),
      'utf-8',
    );
  });

  it('validates generated migrations', async () => {
    setupSuccessfulFlow();

    await command.run([], {
      schemasFolder: 'test-schemas',
      file: 'test-migrations.json',
    });

    expect(jsonValidatorServiceFake.validateMigration).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: 'init',
          tableId: 'users',
          hash: expect.any(String),
          id: expect.any(String),

          schema: mockUserSchema,
        }),
        expect.objectContaining({
          changeType: 'init',
          tableId: 'posts',
          hash: expect.any(String),
          id: expect.any(String),

          schema: mockPostSchema,
        }),
      ]),
    );
  });

  it('writes migrations to specified file', async () => {
    setupSuccessfulFlow();
    const filePath = join(testDir, 'output-migrations.json');

    await command.run([], {
      schemasFolder: 'test-schemas',
      file: filePath,
    });

    expect(mockWriteFile).toHaveBeenCalledWith(
      filePath,
      expect.stringContaining('"changeType": "init"'),
      'utf-8',
    );
  });

  it('logs success message with migration count and file path', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();

    await command.run([], {
      schemasFolder: 'test-schemas',
      file: 'test-migrations.json',
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '✅ Successfully created 2 migrations in: test-migrations.json',
    );

    consoleSpy.mockRestore();
  });

  it('analyzes table dependencies and sorts by dependency order', async () => {
    setupSuccessfulFlow();

    await command.run([], {
      schemasFolder: 'test-schemas',
      file: 'test-migrations.json',
    });

    expect(tableDependencyServiceFake.analyzeDependencies).toHaveBeenCalledWith(
      {
        users: mockUserSchema,

        posts: mockPostSchema,
      },
    );

    expect(
      tableDependencyServiceFake.formatDependencyInfo,
    ).toHaveBeenCalledWith(mockDependencyResult, ['users', 'posts']);
  });

  it('logs dependency analysis information', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();

    await command.run([], {
      schemasFolder: 'test-schemas',
      file: 'test-migrations.json',
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Dependency analysis: posts → users',
    );

    consoleSpy.mockRestore();
  });

  it('logs warnings for circular dependencies', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupCircularDependencies();

    await command.run([], {
      schemasFolder: 'test-schemas',
      file: 'test-migrations.json',
    });

    expect(consoleSpy).toHaveBeenCalledWith('\n⚠️  Warnings:');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Circular dependency detected: users ↔ posts',
    );

    consoleSpy.mockRestore();
  });

  it('filters only JSON files from folder', async () => {
    mockReaddir.mockResolvedValue([
      'users.json',
      'posts.json',
      'readme.txt',
      'config.yaml',
    ] as any);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(mockUserSchema))
      .mockResolvedValueOnce(JSON.stringify(mockPostSchema));
    setupMockServices();

    await command.run([], {
      schemasFolder: 'test-schemas',
      file: 'test-migrations.json',
    });

    expect(mockReadFile).toHaveBeenCalledTimes(2);
    expect(mockReadFile).toHaveBeenCalledWith(
      join('test-schemas', 'users.json'),
      'utf-8',
    );
    expect(mockReadFile).toHaveBeenCalledWith(
      join('test-schemas', 'posts.json'),
      'utf-8',
    );
  });

  it('generates unique timestamps for migrations', async () => {
    setupSuccessfulFlow();
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(1640995200000); // Fixed timestamp

    await command.run([], {
      schemasFolder: 'test-schemas',
      file: 'test-migrations.json',
    });

    const migrations = JSON.parse(mockWriteFile.mock.calls[0][1] as string);

    expect(migrations).toHaveLength(2);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(migrations[0].id).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(migrations[1].id).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(migrations[0].id).not.toBe(migrations[1].id);

    dateSpy.mockRestore();
  });

  it('generates consistent hashes for schemas', async () => {
    setupSuccessfulFlow();

    await command.run([], {
      schemasFolder: 'test-schemas',
      file: 'test-migrations.json',
    });

    const migrations = JSON.parse(mockWriteFile.mock.calls[0][1] as string);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(migrations[0].hash).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(migrations[1].hash).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(typeof migrations[0].hash).toBe('string');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(typeof migrations[1].hash).toBe('string');
  });

  it('parses schemas-folder option correctly', () => {
    const result = command.parseSchemasFolder('test-folder');
    expect(result).toBe('test-folder');
  });

  it('parses file option correctly', () => {
    const result = command.parseFile('test-file.json');
    expect(result).toBe('test-file.json');
  });

  let command: CreateMigrationsCommand;
  let testDir: string;

  const mockUserSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      postId: { type: 'string', foreignKey: 'posts.id' },
    },
  };

  const mockPostSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
    },
  };

  const mockDependencyResult = {
    sortedTables: ['posts', 'users'],
    warnings: [],
  };

  const mockCircularDependencyResult = {
    sortedTables: ['users', 'posts'],
    warnings: ['Circular dependency detected: users ↔ posts'],
  };

  const jsonValidatorServiceFake = {
    validateMigration: jest.fn(),
  };

  const tableDependencyServiceFake = {
    analyzeDependencies: jest.fn(),
    formatDependencyInfo: jest.fn(),
  };

  const setupMockFiles = () => {
    mockReaddir.mockResolvedValue(['users.json', 'posts.json'] as any);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(mockUserSchema))
      .mockResolvedValueOnce(JSON.stringify(mockPostSchema));
  };

  const setupMockServices = () => {
    jsonValidatorServiceFake.validateMigration.mockReturnValue([]);
    tableDependencyServiceFake.analyzeDependencies.mockReturnValue(
      mockDependencyResult,
    );
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'Dependency analysis: posts → users',
    );
    mockWriteFile.mockResolvedValue();
  };

  const setupSuccessfulFlow = () => {
    setupMockFiles();
    setupMockServices();
  };

  const setupCircularDependencies = () => {
    setupMockFiles();
    jsonValidatorServiceFake.validateMigration.mockReturnValue([]);
    tableDependencyServiceFake.analyzeDependencies.mockReturnValue(
      mockCircularDependencyResult,
    );
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'Dependency analysis: users ↔ posts',
    );
    mockWriteFile.mockResolvedValue();
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateMigrationsCommand,
        { provide: JsonValidatorService, useValue: jsonValidatorServiceFake },
        {
          provide: TableDependencyService,
          useValue: tableDependencyServiceFake,
        },
      ],
    }).compile();

    command = module.get<CreateMigrationsCommand>(CreateMigrationsCommand);

    testDir = join(os.tmpdir(), `create-migrations-test-${Date.now()}`);

    jest.clearAllMocks();
    mockWriteFile.mockResolvedValue();
    mockMkdir.mockResolvedValue(undefined);
    mockRm.mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
