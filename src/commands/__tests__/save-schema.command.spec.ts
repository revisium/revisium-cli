/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SaveSchemaCommand } from '../save-schema.command';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';

jest.mock('node:fs/promises');

const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;

describe('SaveSchemaCommand', () => {
  it('throws error when folder option is missing', async () => {
    await expect(command.run([], {} as any)).rejects.toThrow(
      'Error: --folder option is required',
    );
  });

  it('authenticates before fetching schemas', async () => {
    setupSuccessfulFlow();

    await command.run([], { folder: './schemas' });

    expect(coreApiServiceFake.tryToLogin).toHaveBeenCalledWith({
      folder: './schemas',
    });
  });

  it('resolves revision ID from options', async () => {
    setupSuccessfulFlow();
    const options = {
      folder: './schemas',
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
    const folderPath = './test-schemas';

    await command.run([], { folder: folderPath });

    expect(mockMkdir).toHaveBeenCalledWith(folderPath, { recursive: true });
  });

  it('fetches tables with pagination', async () => {
    setupSuccessfulFlow();

    await command.run([], { folder: './schemas' });

    expect(coreApiServiceFake.api.tables).toHaveBeenCalledWith({
      revisionId: 'revision-123',
      first: 100,
      after: undefined,
    });
  });

  it('processes all tables and saves schemas', async () => {
    setupSuccessfulFlow();
    const folderPath = './test-schemas';

    await command.run([], { folder: folderPath });

    expect(coreApiServiceFake.api.tableSchema).toHaveBeenCalledTimes(2);
    expect(coreApiServiceFake.api.tableSchema).toHaveBeenNthCalledWith(
      1,
      'revision-123',
      'users',
    );
    expect(coreApiServiceFake.api.tableSchema).toHaveBeenNthCalledWith(
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
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    // First page
    coreApiServiceFake.api.tables
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

    coreApiServiceFake.api.tableSchema
      .mockResolvedValueOnce({ data: mockUserSchema })
      .mockResolvedValueOnce({ data: mockPostSchema })
      .mockResolvedValueOnce({ data: mockCommentSchema });

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue();

    await command.run([], { folder: './schemas' });

    expect(coreApiServiceFake.api.tables).toHaveBeenCalledTimes(2);
    expect(coreApiServiceFake.api.tables).toHaveBeenNthCalledWith(1, {
      revisionId: 'revision-123',
      first: 100,
      after: undefined,
    });
    expect(coreApiServiceFake.api.tables).toHaveBeenNthCalledWith(2, {
      revisionId: 'revision-123',
      first: 100,
      after: 'cursor1',
    });

    expect(coreApiServiceFake.api.tableSchema).toHaveBeenCalledTimes(3);
  });

  it('continues processing other tables when one fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
    coreApiServiceFake.api.tables.mockResolvedValue(mockTablesResponse);

    coreApiServiceFake.api.tableSchema
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

    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
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
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
    coreApiServiceFake.api.tables.mockResolvedValue({
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
    expect(coreApiServiceFake.api.tableSchema).not.toHaveBeenCalled();
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

  const coreApiServiceFake = {
    tryToLogin: jest.fn(),
    api: {
      tables: jest.fn(),
      tableSchema: jest.fn(),
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
    coreApiServiceFake.api.tableSchema
      .mockResolvedValueOnce({ data: mockUserSchema })
      .mockResolvedValueOnce({ data: mockPostSchema });
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue();
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaveSchemaCommand,
        { provide: CoreApiService, useValue: coreApiServiceFake },
        { provide: DraftRevisionService, useValue: draftRevisionServiceFake },
      ],
    }).compile();

    command = module.get<SaveSchemaCommand>(SaveSchemaCommand);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
