/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { SaveRowsCommand } from '../save-rows.command';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';

jest.mock('fs/promises');

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

    expect(coreApiServiceFake.tryToLogin).toHaveBeenCalledWith({
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

    expect(draftRevisionServiceFake.getDraftRevisionId).toHaveBeenCalledWith(
      options,
    );
  });

  it('creates output folder recursively', async () => {
    setupSuccessfulFlow();

    await command.run([], { folder: './test-data' });

    expect(mockMkdir).toHaveBeenCalledWith('./test-data', { recursive: true });
  });

  it('processes all tables when no filter specified', async () => {
    setupSuccessfulFlow();

    await command.run([], { folder: './data' });

    expect(coreApiServiceFake.api.tables).toHaveBeenCalledWith({
      revisionId: 'revision-123',
      first: 100,
      after: undefined,
    });

    expect(coreApiServiceFake.api.rows).toHaveBeenCalledTimes(2);
    expect(coreApiServiceFake.api.rows).toHaveBeenNthCalledWith(
      1,
      'revision-123',
      'users',
      { first: 100, after: undefined },
    );
    expect(coreApiServiceFake.api.rows).toHaveBeenNthCalledWith(
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

    expect(coreApiServiceFake.api.tables).not.toHaveBeenCalled();
    expect(coreApiServiceFake.api.rows).toHaveBeenCalledTimes(2);
    expect(coreApiServiceFake.api.rows).toHaveBeenNthCalledWith(
      1,
      'revision-123',
      'users',
      { first: 100, after: undefined },
    );
    expect(coreApiServiceFake.api.rows).toHaveBeenNthCalledWith(
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
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    // First page of tables
    coreApiServiceFake.api.tables
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

    coreApiServiceFake.api.rows
      .mockResolvedValueOnce(mockUserRowsResponse)
      .mockResolvedValueOnce(mockPostRowsResponse);

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue();

    await command.run([], { folder: './data' });

    expect(coreApiServiceFake.api.tables).toHaveBeenCalledTimes(2);
    expect(coreApiServiceFake.api.tables).toHaveBeenNthCalledWith(2, {
      revisionId: 'revision-123',
      first: 100,
      after: 'cursor1',
    });
  });

  it('handles pagination for rows', async () => {
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
    coreApiServiceFake.api.tables.mockResolvedValue({
      data: {
        edges: [{ node: { id: 'users' } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    // First page of rows
    coreApiServiceFake.api.rows
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

    expect(coreApiServiceFake.api.rows).toHaveBeenCalledTimes(2);
    expect(coreApiServiceFake.api.rows).toHaveBeenNthCalledWith(
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
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
    coreApiServiceFake.api.tables.mockResolvedValue({
      data: {
        edges: [{ node: { id: 'users' } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    coreApiServiceFake.api.rows.mockResolvedValue(mockUserRowsResponse);

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
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
    coreApiServiceFake.api.tables.mockResolvedValue({
      data: {
        edges: [{ node: { id: 'users' } }, { node: { id: 'posts' } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    coreApiServiceFake.api.rows
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

    expect(coreApiServiceFake.api.rows).toHaveBeenCalledTimes(3);
    expect(coreApiServiceFake.api.rows).toHaveBeenNthCalledWith(
      1,
      'revision-123',
      'users',
      expect.any(Object),
    );
    expect(coreApiServiceFake.api.rows).toHaveBeenNthCalledWith(
      2,
      'revision-123',
      'posts',
      expect.any(Object),
    );
    expect(coreApiServiceFake.api.rows).toHaveBeenNthCalledWith(
      3,
      'revision-123',
      'comments',
      expect.any(Object),
    );
  });

  it('handles empty tables response', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
    coreApiServiceFake.api.tables.mockResolvedValue({
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
    expect(coreApiServiceFake.api.rows).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('handles API errors gracefully and throws', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
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

  const coreApiServiceFake = {
    tryToLogin: jest.fn(),
    api: {
      tables: jest.fn(),
      rows: jest.fn(),
    },
  };

  const draftRevisionServiceFake = {
    getDraftRevisionId: jest.fn(),
  };

  const setupSuccessfulFlow = () => {
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
    coreApiServiceFake.api.tables.mockResolvedValue(mockTablesResponse);
    coreApiServiceFake.api.rows
      .mockResolvedValueOnce(mockUserRowsResponse)
      .mockResolvedValueOnce(mockPostRowsResponse);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue();
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaveRowsCommand,
        { provide: CoreApiService, useValue: coreApiServiceFake },
        { provide: DraftRevisionService, useValue: draftRevisionServiceFake },
      ],
    }).compile();

    command = module.get<SaveRowsCommand>(SaveRowsCommand);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
