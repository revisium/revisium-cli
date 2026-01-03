/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SaveRowsCommand } from '../save-rows.command';
import { ConnectionService } from 'src/services/connection.service';

jest.mock('node:fs/promises');

const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;

describe('SaveRowsCommand', () => {
  it('throws error when folder option is missing', async () => {
    await expect(command.run([], {} as any)).rejects.toThrow(
      'Error: --folder option is required',
    );
  });

  it('authenticates before fetching rows', async () => {
    setupSuccessfulFlow();

    await command.run([], { folder: './data' });

    expect(connectionServiceFake.connect).toHaveBeenCalledWith({
      folder: './data',
    });
  });

  it('resolves revision ID from options', async () => {
    setupSuccessfulFlow();
    const options = {
      folder: './data',
      organization: 'test-org',
      project: 'test-project',
      branch: 'test-branch',
    };

    await command.run([], options);

    expect(connectionServiceFake.connect).toHaveBeenCalledWith(options);
  });

  it('creates output folder recursively', async () => {
    setupSuccessfulFlow();

    await command.run([], { folder: './test-data' });

    expect(mockMkdir).toHaveBeenCalledWith('./test-data', { recursive: true });
  });

  it('processes all tables when no filter specified', async () => {
    setupSuccessfulFlow();

    await command.run([], { folder: './data' });

    expect(connectionServiceFake.api.tables).toHaveBeenCalledWith({
      revisionId: 'revision-123',
      first: 100,
      after: undefined,
    });

    expect(connectionServiceFake.api.rows).toHaveBeenCalledTimes(2);
    expect(connectionServiceFake.api.rows).toHaveBeenNthCalledWith(
      1,
      'revision-123',
      'users',
      { first: 100, after: undefined },
    );
    expect(connectionServiceFake.api.rows).toHaveBeenNthCalledWith(
      2,
      'revision-123',
      'posts',
      { first: 100, after: undefined },
    );
  });

  it('processes only specified tables when filter provided', async () => {
    setupSuccessfulFlow();

    await command.run([], {
      folder: './data',
      tables: 'users,posts',
    });

    expect(connectionServiceFake.api.tables).not.toHaveBeenCalled();
    expect(connectionServiceFake.api.rows).toHaveBeenCalledTimes(2);
    expect(connectionServiceFake.api.rows).toHaveBeenNthCalledWith(
      1,
      'revision-123',
      'users',
      { first: 100, after: undefined },
    );
    expect(connectionServiceFake.api.rows).toHaveBeenNthCalledWith(
      2,
      'revision-123',
      'posts',
      { first: 100, after: undefined },
    );
  });

  it('creates table-specific folders and saves rows', async () => {
    setupSuccessfulFlow();
    const folderPath = './test-data';

    await command.run([], { folder: folderPath });

    expect(mockMkdir).toHaveBeenCalledWith(join(folderPath, 'users'), {
      recursive: true,
    });
    expect(mockMkdir).toHaveBeenCalledWith(join(folderPath, 'posts'), {
      recursive: true,
    });

    expect(mockWriteFile).toHaveBeenCalledTimes(3);
    expect(mockWriteFile).toHaveBeenNthCalledWith(
      1,
      join(folderPath, 'users', 'user-1.json'),
      JSON.stringify(mockUserRows[0], null, 2),
      'utf-8',
    );
    expect(mockWriteFile).toHaveBeenNthCalledWith(
      2,
      join(folderPath, 'users', 'user-2.json'),
      JSON.stringify(mockUserRows[1], null, 2),
      'utf-8',
    );
    expect(mockWriteFile).toHaveBeenNthCalledWith(
      3,
      join(folderPath, 'posts', 'post-1.json'),
      JSON.stringify(mockPostRows[0], null, 2),
      'utf-8',
    );
  });

  it('logs progress during processing', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();

    await command.run([], { folder: './data' });

    expect(consoleSpy).toHaveBeenCalledWith('📊 Found 2 tables to process');
    expect(consoleSpy).toHaveBeenCalledWith('📋 Processing table: users');
    expect(consoleSpy).toHaveBeenCalledWith('  📊 Found 2 rows in table users');
    expect(consoleSpy).toHaveBeenCalledWith(
      '✅ Saved 2/2 rows from table: users',
    );
    expect(consoleSpy).toHaveBeenCalledWith('📋 Processing table: posts');
    expect(consoleSpy).toHaveBeenCalledWith('  📊 Found 1 rows in table posts');
    expect(consoleSpy).toHaveBeenCalledWith(
      '✅ Saved 1/1 rows from table: posts',
    );

    consoleSpy.mockRestore();
  });

  it('logs final success message', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();
    const folderPath = './test-data';

    await command.run([], { folder: folderPath });

    expect(consoleSpy).toHaveBeenCalledWith(
      `🎉 Successfully processed 2 tables in: ${folderPath}`,
    );

    consoleSpy.mockRestore();
  });

  it('handles pagination for tables', async () => {
    connectionServiceFake.connect.mockResolvedValue(undefined);

    // First page of tables
    connectionServiceFake.api.tables
      .mockResolvedValueOnce({
        data: {
          edges: [{ node: { id: 'users' } }],
          pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
        },
      })
      // Second page of tables
      .mockResolvedValueOnce({
        data: {
          edges: [{ node: { id: 'posts' } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    connectionServiceFake.api.rows
      .mockResolvedValueOnce(mockUserRowsResponse)
      .mockResolvedValueOnce(mockPostRowsResponse);

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue();

    await command.run([], { folder: './data' });

    expect(connectionServiceFake.api.tables).toHaveBeenCalledTimes(2);
    expect(connectionServiceFake.api.tables).toHaveBeenNthCalledWith(2, {
      revisionId: 'revision-123',
      first: 100,
      after: 'cursor1',
    });
  });

  it('handles pagination for rows', async () => {
    connectionServiceFake.connect.mockResolvedValue(undefined);
    connectionServiceFake.api.tables.mockResolvedValue({
      data: {
        edges: [{ node: { id: 'users' } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    // First page of rows
    connectionServiceFake.api.rows
      .mockResolvedValueOnce({
        data: {
          totalCount: 3,
          edges: [{ node: mockUserRows[0] }],
          pageInfo: { hasNextPage: true, endCursor: 'row-cursor1' },
        },
      })
      // Second page of rows
      .mockResolvedValueOnce({
        data: {
          totalCount: 3,
          edges: [
            { node: mockUserRows[1] },
            { node: { id: 'user-3', name: 'Charlie' } },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue();

    await command.run([], { folder: './data' });

    expect(connectionServiceFake.api.rows).toHaveBeenCalledTimes(2);
    expect(connectionServiceFake.api.rows).toHaveBeenNthCalledWith(
      2,
      'revision-123',
      'users',
      {
        first: 100,
        after: 'row-cursor1',
      },
    );

    expect(mockWriteFile).toHaveBeenCalledTimes(3);
  });

  it('continues processing when individual row fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    connectionServiceFake.connect.mockResolvedValue(undefined);
    connectionServiceFake.api.tables.mockResolvedValue({
      data: {
        edges: [{ node: { id: 'users' } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    connectionServiceFake.api.rows.mockResolvedValue(mockUserRowsResponse);

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile
      .mockRejectedValueOnce(new Error('Write failed'))
      .mockResolvedValueOnce();

    await command.run([], { folder: './data' });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Failed to save row user-1 from table users:',
      expect.any(Error),
    );

    expect(mockWriteFile).toHaveBeenCalledTimes(2); // Should continue with second row

    consoleErrorSpy.mockRestore();
  });

  it('continues processing when table fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    connectionServiceFake.connect.mockResolvedValue(undefined);
    connectionServiceFake.api.tables.mockResolvedValue({
      data: {
        edges: [{ node: { id: 'users' } }, { node: { id: 'posts' } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    connectionServiceFake.api.rows
      .mockRejectedValueOnce(new Error('Table access denied'))
      .mockResolvedValueOnce(mockPostRowsResponse);

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue();

    await command.run([], { folder: './data' });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Failed to process table users:',
      'Table access denied',
    );

    expect(mockWriteFile).toHaveBeenCalledTimes(1); // Should process posts table

    consoleErrorSpy.mockRestore();
  });

  it('handles tables filter with whitespace', async () => {
    setupSuccessfulFlow();

    await command.run([], {
      folder: './data',
      tables: ' users , posts , comments ',
    });

    expect(connectionServiceFake.api.rows).toHaveBeenCalledTimes(3);
    expect(connectionServiceFake.api.rows).toHaveBeenNthCalledWith(
      1,
      'revision-123',
      'users',
      expect.any(Object),
    );
    expect(connectionServiceFake.api.rows).toHaveBeenNthCalledWith(
      2,
      'revision-123',
      'posts',
      expect.any(Object),
    );
    expect(connectionServiceFake.api.rows).toHaveBeenNthCalledWith(
      3,
      'revision-123',
      'comments',
      expect.any(Object),
    );
  });

  it('handles empty tables response', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    connectionServiceFake.connect.mockResolvedValue(undefined);
    connectionServiceFake.api.tables.mockResolvedValue({
      data: {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    mockMkdir.mockResolvedValue(undefined);

    await command.run([], { folder: './data' });

    expect(consoleSpy).toHaveBeenCalledWith('📊 Found 0 tables to process');
    expect(consoleSpy).toHaveBeenCalledWith(
      '🎉 Successfully processed 0 tables in: ./data',
    );
    expect(connectionServiceFake.api.rows).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('handles API errors gracefully and throws', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    connectionServiceFake.connect.mockResolvedValue(undefined);
    mockMkdir.mockRejectedValue(new Error('Permission denied'));

    await expect(
      command.run([], { folder: './readonly-folder' }),
    ).rejects.toThrow('Permission denied');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error saving table rows:',
      'Permission denied',
    );

    consoleErrorSpy.mockRestore();
  });

  it('parses folder option correctly', () => {
    const result = command.parseFolder('./test-data');
    expect(result).toBe('./test-data');
  });

  it('parses tables option correctly', () => {
    const result = command.parseTables('users,posts,comments');
    expect(result).toBe('users,posts,comments');
  });

  let command: SaveRowsCommand;

  const mockUserRows = [
    { id: 'user-1', name: 'Alice' },
    { id: 'user-2', name: 'Bob' },
  ];

  const mockPostRows = [{ id: 'post-1', title: 'Hello World' }];

  const mockUserRowsResponse = {
    data: {
      totalCount: 2,
      edges: mockUserRows.map((row) => ({ node: row })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };

  const mockPostRowsResponse = {
    data: {
      totalCount: 1,
      edges: mockPostRows.map((row) => ({ node: row })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };

  const mockTablesResponse = {
    data: {
      edges: [{ node: { id: 'users' } }, { node: { id: 'posts' } }],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };

  const connectionServiceFake = {
    connect: jest.fn(),
    revisionId: 'revision-123',
    api: {
      tables: jest.fn(),
      rows: jest.fn(),
    },
  };

  const setupSuccessfulFlow = () => {
    connectionServiceFake.connect.mockResolvedValue(undefined);
    connectionServiceFake.api.tables.mockResolvedValue(mockTablesResponse);
    connectionServiceFake.api.rows
      .mockResolvedValueOnce(mockUserRowsResponse)
      .mockResolvedValueOnce(mockPostRowsResponse);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue();
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaveRowsCommand,
        { provide: ConnectionService, useValue: connectionServiceFake },
      ],
    }).compile();

    command = module.get<SaveRowsCommand>(SaveRowsCommand);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
