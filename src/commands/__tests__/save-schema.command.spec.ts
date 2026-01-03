/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SaveSchemaCommand } from '../save-schema.command';
import { ConnectionService } from 'src/services/connection.service';

jest.mock('node:fs/promises');

const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;

describe('SaveSchemaCommand', () => {
  it('throws error when folder option is missing', async () => {
    await expect(command.run([], {} as any)).rejects.toThrow(
      'Error: --folder option is required',
    );
  });

  it('connects before fetching schemas', async () => {
    setupSuccessfulFlow();

    await command.run([], { folder: './schemas' });

    expect(connectionServiceFake.connect).toHaveBeenCalledWith({
      folder: './schemas',
    });
  });

  it('creates output folder recursively', async () => {
    setupSuccessfulFlow();
    const folderPath = './test-schemas';

    await command.run([], { folder: folderPath });

    expect(mockMkdir).toHaveBeenCalledWith(folderPath, { recursive: true });
  });

  it('fetches tables with pagination', async () => {
    setupSuccessfulFlow();

    await command.run([], { folder: './schemas' });

    expect(connectionServiceFake.api.tables).toHaveBeenCalledWith({
      revisionId: 'revision-123',
      first: 100,
      after: undefined,
    });
  });

  it('processes all tables and saves schemas', async () => {
    setupSuccessfulFlow();
    const folderPath = './test-schemas';

    await command.run([], { folder: folderPath });

    expect(connectionServiceFake.api.tableSchema).toHaveBeenCalledTimes(2);
    expect(connectionServiceFake.api.tableSchema).toHaveBeenNthCalledWith(
      1,
      'revision-123',
      'users',
    );
    expect(connectionServiceFake.api.tableSchema).toHaveBeenNthCalledWith(
      2,
      'revision-123',
      'posts',
    );

    expect(mockWriteFile).toHaveBeenCalledTimes(2);
    expect(mockWriteFile).toHaveBeenNthCalledWith(
      1,
      join(folderPath, 'users.json'),
      JSON.stringify(mockUserSchema, null, 2),
      'utf-8',
    );
    expect(mockWriteFile).toHaveBeenNthCalledWith(
      2,
      join(folderPath, 'posts.json'),
      JSON.stringify(mockPostSchema, null, 2),
      'utf-8',
    );
  });

  it('logs progress during table processing', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();

    await command.run([], { folder: './schemas' });

    expect(consoleSpy).toHaveBeenCalledWith('🔍 Fetching tables...');
    expect(consoleSpy).toHaveBeenCalledWith('📊 Found 2 tables to process');
    expect(consoleSpy).toHaveBeenCalledWith('📋 Processing table: users');
    expect(consoleSpy).toHaveBeenCalledWith('📋 Processing table: posts');
    expect(consoleSpy).toHaveBeenCalledWith(
      '✅ Saved schema: users.json (1/2)',
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '✅ Saved schema: posts.json (2/2)',
    );

    consoleSpy.mockRestore();
  });

  it('logs final success message with count and folder', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();
    const folderPath = './test-schemas';

    await command.run([], { folder: folderPath });

    expect(consoleSpy).toHaveBeenCalledWith(
      `🎉 Successfully saved 2/2 table schemas to: ${folderPath}`,
    );

    consoleSpy.mockRestore();
  });

  it('handles pagination with multiple pages', async () => {
    connectionServiceFake.connect.mockResolvedValue(undefined);

    // First page
    connectionServiceFake.api.tables
      .mockResolvedValueOnce({
        data: {
          totalCount: 3,
          edges: [{ node: { id: 'users' } }, { node: { id: 'posts' } }],
          pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
        },
      })
      // Second page
      .mockResolvedValueOnce({
        data: {
          totalCount: 3,
          edges: [{ node: { id: 'comments' } }],
          pageInfo: { hasNextPage: false, endCursor: 'cursor2' },
        },
      });

    connectionServiceFake.api.tableSchema
      .mockResolvedValueOnce({ data: mockUserSchema })
      .mockResolvedValueOnce({ data: mockPostSchema })
      .mockResolvedValueOnce({ data: mockCommentSchema });

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue();

    await command.run([], { folder: './schemas' });

    expect(connectionServiceFake.api.tables).toHaveBeenCalledTimes(2);
    expect(connectionServiceFake.api.tables).toHaveBeenNthCalledWith(1, {
      revisionId: 'revision-123',
      first: 100,
      after: undefined,
    });
    expect(connectionServiceFake.api.tables).toHaveBeenNthCalledWith(2, {
      revisionId: 'revision-123',
      first: 100,
      after: 'cursor1',
    });

    expect(connectionServiceFake.api.tableSchema).toHaveBeenCalledTimes(3);
  });

  it('continues processing other tables when one fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    connectionServiceFake.connect.mockResolvedValue(undefined);
    connectionServiceFake.api.tables.mockResolvedValue(mockTablesResponse);

    connectionServiceFake.api.tableSchema
      .mockRejectedValueOnce(new Error('Schema not found'))
      .mockResolvedValueOnce({ data: mockPostSchema });

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue();

    await command.run([], { folder: './schemas' });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Failed to save schema for table users:',
      expect.any(Error),
    );

    expect(mockWriteFile).toHaveBeenCalledTimes(1); // Only posts schema should be saved
    expect(mockWriteFile).toHaveBeenCalledWith(
      join('./schemas', 'posts.json'),
      JSON.stringify(mockPostSchema, null, 2),
      'utf-8',
    );

    consoleErrorSpy.mockRestore();
  });

  it('handles API errors gracefully and throws', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    connectionServiceFake.connect.mockResolvedValue(undefined);
    mockMkdir.mockRejectedValue(new Error('Permission denied'));

    await expect(
      command.run([], { folder: './readonly-folder' }),
    ).rejects.toThrow('Permission denied');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error saving table schemas:',
      'Permission denied',
    );

    consoleErrorSpy.mockRestore();
  });

  it('handles empty tables response', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    connectionServiceFake.connect.mockResolvedValue(undefined);
    connectionServiceFake.api.tables.mockResolvedValue({
      data: {
        totalCount: 0,
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    mockMkdir.mockResolvedValue(undefined);

    await command.run([], { folder: './empty-schemas' });

    expect(consoleSpy).toHaveBeenCalledWith('📊 Found 0 tables to process');
    expect(consoleSpy).toHaveBeenCalledWith(
      '🎉 Successfully saved 0/0 table schemas to: ./empty-schemas',
    );
    expect(connectionServiceFake.api.tableSchema).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('formats JSON with proper indentation', async () => {
    setupSuccessfulFlow();

    await command.run([], { folder: './schemas' });

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify(mockUserSchema, null, 2),
      'utf-8',
    );
  });

  it('parses folder option correctly', () => {
    const result = command.parseFolder('./test-schemas');
    expect(result).toBe('./test-schemas');
  });

  let command: SaveSchemaCommand;

  const mockUserSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
    },
  };

  const mockPostSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
    },
  };

  const mockCommentSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      content: { type: 'string' },
    },
  };

  const mockTablesResponse = {
    data: {
      totalCount: 2,
      edges: [{ node: { id: 'users' } }, { node: { id: 'posts' } }],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };

  const connectionServiceFake = {
    connect: jest.fn(),
    revisionId: 'revision-123',
    api: {
      tables: jest.fn(),
      tableSchema: jest.fn(),
    },
  };

  const setupSuccessfulFlow = () => {
    connectionServiceFake.connect.mockResolvedValue(undefined);
    connectionServiceFake.api.tables.mockResolvedValue(mockTablesResponse);
    connectionServiceFake.api.tableSchema
      .mockResolvedValueOnce({ data: mockUserSchema })
      .mockResolvedValueOnce({ data: mockPostSchema });
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue();
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaveSchemaCommand,
        { provide: ConnectionService, useValue: connectionServiceFake },
      ],
    }).compile();

    command = module.get<SaveSchemaCommand>(SaveSchemaCommand);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
