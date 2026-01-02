/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Test, TestingModule } from '@nestjs/testing';
import { readdir, readFile } from 'fs/promises';
import { UploadRowsCommand } from '../upload-rows.command';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';
import { JsonValidatorService } from 'src/services/json-validator.service';
import { TableDependencyService } from 'src/services/table-dependency.service';
import { CommitRevisionService } from 'src/services/commit-revision.service';

jest.mock('fs/promises');

const mockReaddir = readdir as jest.MockedFunction<typeof readdir>;
const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;

describe('UploadRowsCommand', () => {
  let command: UploadRowsCommand;
  let consoleSpy: jest.SpyInstance;

  const mockUserSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
  };

  const mockPostSchema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
    },
  };

  const mockValidation = jest.fn();

  const coreApiServiceFake = {
    tryToLogin: jest.fn(),
    bulkCreateSupported: undefined as boolean | undefined,
    bulkUpdateSupported: undefined as boolean | undefined,
    api: {
      tableSchema: jest.fn(),
      rows: jest.fn(),
      row: jest.fn(),
      createRow: jest.fn(),
      createRows: jest.fn(),
      updateRow: jest.fn(),
      updateRows: jest.fn(),
    },
  };

  const draftRevisionServiceFake = {
    getDraftRevisionId: jest.fn(),
  };

  const jsonValidatorServiceFake = {
    validateSchema: jest.fn(),
  };

  const tableDependencyServiceFake = {
    analyzeDependencies: jest.fn(),
    formatDependencyInfo: jest.fn(),
  };

  const commitRevisionServiceFake = {
    handleCommitFlow: jest.fn(),
  };

  const setupSuccessfulFlow = () => {
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    mockReaddir
      .mockResolvedValueOnce([
        { name: 'users', isDirectory: () => true },
        { name: 'posts', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false },
      ] as any)
      .mockResolvedValueOnce(['post-1.json'] as any)
      .mockResolvedValueOnce([
        'user-1.json',
        'user-2.json',
        'readme.txt',
      ] as any);

    coreApiServiceFake.api.tableSchema
      .mockResolvedValueOnce({ data: mockUserSchema })
      .mockResolvedValueOnce({ data: mockPostSchema })
      .mockResolvedValueOnce({ data: mockUserSchema })
      .mockResolvedValueOnce({ data: mockPostSchema });

    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts', 'users'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'Dependency analysis: posts → users',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    mockReadFile
      .mockResolvedValueOnce('{"id": "user-1", "data": {"name": "Alice"}}')
      .mockResolvedValueOnce('{"id": "user-2", "data": {"name": "Bob"}}')
      .mockResolvedValueOnce(
        '{"id": "post-1", "data": {"title": "Hello World"}}',
      );

    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    coreApiServiceFake.api.createRows.mockResolvedValue({
      data: { rows: [{ id: 'new-row' }] },
    });
    coreApiServiceFake.api.updateRows.mockResolvedValue({
      data: { rows: [{ id: 'updated-row' }] },
    });

    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadRowsCommand,
        { provide: CoreApiService, useValue: coreApiServiceFake },
        { provide: DraftRevisionService, useValue: draftRevisionServiceFake },
        { provide: JsonValidatorService, useValue: jsonValidatorServiceFake },
        {
          provide: TableDependencyService,
          useValue: tableDependencyServiceFake,
        },
        {
          provide: CommitRevisionService,
          useValue: commitRevisionServiceFake,
        },
      ],
    }).compile();

    command = module.get<UploadRowsCommand>(UploadRowsCommand);

    jest.clearAllMocks();
    coreApiServiceFake.bulkCreateSupported = undefined;
    coreApiServiceFake.bulkUpdateSupported = undefined;
    if (consoleSpy) {
      consoleSpy.mockRestore();
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (consoleSpy) {
      consoleSpy.mockRestore();
    }
  });

  it('throws error when folder option is missing', async () => {
    await expect(command.run([], {} as any)).rejects.toThrow(
      'Error: --folder option is required',
    );
  });

  it('authenticates before uploading rows', async () => {
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

  it('scans folder for table directories when no filter specified', async () => {
    setupSuccessfulFlow();

    await command.run([], { folder: './data' });

    expect(mockReaddir).toHaveBeenNthCalledWith(1, './data', {
      withFileTypes: true,
    });
  });

  it('uses table filter instead of scanning when provided', async () => {
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    coreApiServiceFake.api.tableSchema
      .mockResolvedValueOnce({ data: mockUserSchema })
      .mockResolvedValueOnce({ data: mockPostSchema })
      .mockResolvedValueOnce({ data: mockUserSchema })
      .mockResolvedValueOnce({ data: mockPostSchema });

    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts', 'users'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'posts → users',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    mockReaddir
      .mockResolvedValueOnce(['post-1.json'] as any)
      .mockResolvedValueOnce(['user-1.json'] as any);

    mockReadFile
      .mockResolvedValueOnce(
        '{"id": "post-1", "data": {"title": "Hello World"}}',
      )
      .mockResolvedValueOnce('{"id": "user-1", "data": {"name": "Alice"}}');

    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    coreApiServiceFake.api.createRows.mockResolvedValue({
      data: { rows: [{ id: 'new-row' }] },
    });

    await command.run([], {
      folder: './data',
      tables: 'users,posts',
    });

    expect(mockReaddir).not.toHaveBeenCalledWith('./data', {
      withFileTypes: true,
    });

    expect(coreApiServiceFake.api.tableSchema).toHaveBeenCalledWith(
      'revision-123',
      'users',
    );
    expect(coreApiServiceFake.api.tableSchema).toHaveBeenCalledWith(
      'revision-123',
      'posts',
    );
  });

  it('fetches schemas for dependency analysis', async () => {
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    coreApiServiceFake.api.tableSchema
      .mockResolvedValueOnce({ data: mockUserSchema })
      .mockResolvedValueOnce({ data: mockPostSchema })
      .mockResolvedValueOnce({ data: mockUserSchema })
      .mockResolvedValueOnce({ data: mockPostSchema });

    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts', 'users'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'posts → users',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    mockReaddir
      .mockResolvedValueOnce(['post-1.json'] as any)
      .mockResolvedValueOnce(['user-1.json'] as any);

    mockReadFile
      .mockResolvedValueOnce(
        '{"id": "post-1", "data": {"title": "Hello World"}}',
      )
      .mockResolvedValueOnce('{"id": "user-1", "data": {"name": "Alice"}}');

    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    coreApiServiceFake.api.createRows.mockResolvedValue({
      data: { rows: [{ id: 'post-1' }] },
    });

    await command.run([], { folder: './data', tables: 'users,posts' });

    expect(coreApiServiceFake.api.tableSchema).toHaveBeenCalledTimes(4);
    expect(tableDependencyServiceFake.analyzeDependencies).toHaveBeenCalledWith(
      {
        users: mockUserSchema,
        posts: mockPostSchema,
      },
    );
  });

  it('displays dependency analysis information', async () => {
    const localConsoleSpy = jest.spyOn(console, 'log').mockImplementation();

    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    coreApiServiceFake.api.tableSchema.mockResolvedValue({
      data: mockUserSchema,
    });

    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts', 'users'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'Dependency analysis: posts → users',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    mockReaddir.mockResolvedValue(['post-1.json'] as any);
    mockReadFile.mockResolvedValue(
      '{"id": "post-1", "data": {"title": "Hello World"}}',
    );

    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: [{ node: { id: 'post-1', data: { title: 'Hello World' } } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await command.run([], { folder: './data', tables: 'posts,users' });

    expect(localConsoleSpy).toHaveBeenCalledWith(
      '📊 Found 2 tables to process',
    );
    expect(localConsoleSpy).toHaveBeenCalledWith(
      'Dependency analysis: posts → users',
    );

    localConsoleSpy.mockRestore();
  });

  it('processes tables in dependency order', async () => {
    setupSuccessfulFlow();

    await command.run([], { folder: './data' });

    const processingCalls = consoleSpy.mock.calls.filter(
      (call: any) =>
        call[0] && String(call[0]).includes('📋 Processing table:'),
    );

    expect(processingCalls[0][0]).toContain('posts');
    expect(processingCalls[1][0]).toContain('users');
  });

  it('validates row data against table schema', async () => {
    setupSuccessfulFlow();
    mockValidation.mockReturnValue(true);

    await command.run([], { folder: './data' });

    expect(jsonValidatorServiceFake.validateSchema).toHaveBeenCalledWith(
      mockUserSchema,
    );
    expect(jsonValidatorServiceFake.validateSchema).toHaveBeenCalledWith(
      mockPostSchema,
    );
    expect(mockValidation).toHaveBeenCalledTimes(3);
  });

  it('creates new rows when they do not exist using bulk API', async () => {
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    coreApiServiceFake.api.tableSchema.mockResolvedValue({
      data: mockPostSchema,
    });
    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'No dependencies',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    mockReaddir.mockResolvedValue(['post-1.json'] as any);
    mockReadFile.mockResolvedValue(
      '{"id": "post-1", "data": {"title": "Hello World"}}',
    );

    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    coreApiServiceFake.api.createRows.mockResolvedValue({
      data: { rows: [{ id: 'post-1' }] },
    });

    await command.run([], { folder: './data', tables: 'posts' });

    expect(coreApiServiceFake.api.createRows).toHaveBeenCalledWith(
      'revision-123',
      'posts',
      {
        rows: [{ rowId: 'post-1', data: { title: 'Hello World' } }],
        isRestore: true,
      },
    );
  });

  it('updates existing rows when data is different using bulk API', async () => {
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    coreApiServiceFake.api.tableSchema.mockResolvedValue({
      data: mockPostSchema,
    });
    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'No dependencies',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    mockReaddir.mockResolvedValue(['post-1.json'] as any);
    mockReadFile.mockResolvedValue(
      '{"id": "post-1", "data": {"title": "Hello World"}}',
    );

    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: [{ node: { id: 'post-1', data: { title: 'Old Title' } } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    coreApiServiceFake.api.updateRows.mockResolvedValue({
      data: { rows: [{ id: 'post-1' }] },
    });

    await command.run([], { folder: './data', tables: 'posts' });

    expect(coreApiServiceFake.api.updateRows).toHaveBeenCalledWith(
      'revision-123',
      'posts',
      {
        rows: [{ rowId: 'post-1', data: { title: 'Hello World' } }],
      },
    );
  });

  it('skips rows when data is identical', async () => {
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    coreApiServiceFake.api.tableSchema.mockResolvedValue({
      data: mockPostSchema,
    });
    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'No dependencies',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    mockReaddir.mockResolvedValue(['post-1.json'] as any);
    mockReadFile.mockResolvedValue(
      '{"id": "post-1", "data": {"title": "Hello World"}}',
    );

    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: [{ node: { id: 'post-1', data: { title: 'Hello World' } } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await command.run([], { folder: './data', tables: 'posts' });

    expect(coreApiServiceFake.api.updateRows).not.toHaveBeenCalled();
    expect(coreApiServiceFake.api.createRows).not.toHaveBeenCalled();
  });

  it('falls back to single-row mode when bulk create returns 404', async () => {
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    coreApiServiceFake.api.tableSchema.mockResolvedValue({
      data: mockPostSchema,
    });
    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'No dependencies',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    mockReaddir.mockResolvedValue(['post-1.json', 'post-2.json'] as any);
    mockReadFile
      .mockResolvedValueOnce(
        '{"id": "post-1", "data": {"title": "Hello World"}}',
      )
      .mockResolvedValueOnce('{"id": "post-2", "data": {"title": "Second"}}');

    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    coreApiServiceFake.api.createRows.mockResolvedValue({
      error: { status: 404 },
    });
    coreApiServiceFake.api.createRow.mockResolvedValue({
      data: { id: 'post-1' },
    });

    await command.run([], { folder: './data', tables: 'posts' });

    expect(coreApiServiceFake.api.createRow).toHaveBeenCalledTimes(2);
    expect(coreApiServiceFake.api.createRow).toHaveBeenCalledWith(
      'revision-123',
      'posts',
      {
        rowId: 'post-1',
        data: { title: 'Hello World' },
        isRestore: true,
      },
    );
  });

  it('falls back to single-row mode when bulk update returns 404', async () => {
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    coreApiServiceFake.api.tableSchema.mockResolvedValue({
      data: mockPostSchema,
    });
    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'No dependencies',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    mockReaddir.mockResolvedValue(['post-1.json'] as any);
    mockReadFile.mockResolvedValue(
      '{"id": "post-1", "data": {"title": "New Title"}}',
    );

    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: [{ node: { id: 'post-1', data: { title: 'Old Title' } } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    coreApiServiceFake.api.updateRows.mockResolvedValue({
      error: { status: 404 },
    });
    coreApiServiceFake.api.updateRow.mockResolvedValue({
      data: { id: 'post-1' },
    });

    await command.run([], { folder: './data', tables: 'posts' });

    expect(coreApiServiceFake.api.updateRow).toHaveBeenCalledWith(
      'revision-123',
      'posts',
      'post-1',
      {
        data: { title: 'New Title' },
        isRestore: true,
      },
    );
  });

  it('caches bulk support status after first fallback', async () => {
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    coreApiServiceFake.api.tableSchema.mockResolvedValue({
      data: mockPostSchema,
    });
    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts', 'users'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'No dependencies',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    mockReaddir
      .mockResolvedValueOnce(['post-1.json'] as any)
      .mockResolvedValueOnce(['user-1.json'] as any);

    mockReadFile
      .mockResolvedValueOnce(
        '{"id": "post-1", "data": {"title": "Hello World"}}',
      )
      .mockResolvedValueOnce('{"id": "user-1", "data": {"name": "Alice"}}');

    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    coreApiServiceFake.api.createRows.mockResolvedValue({
      error: { status: 404 },
    });
    coreApiServiceFake.api.createRow.mockResolvedValue({
      data: { id: 'created' },
    });

    await command.run([], { folder: './data', tables: 'posts,users' });

    expect(coreApiServiceFake.api.createRows).toHaveBeenCalledTimes(1);
    expect(coreApiServiceFake.api.createRow).toHaveBeenCalledTimes(2);
  });

  it('tracks upload statistics correctly', async () => {
    const localConsoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();

    await command.run([], { folder: './data' });

    expect(localConsoleSpy).toHaveBeenCalledWith('\n🎉 Upload Summary:');
    expect(localConsoleSpy).toHaveBeenCalledWith('📊 Total rows processed: 3');

    localConsoleSpy.mockRestore();
  });

  it('handles schema validation failures', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();
    mockValidation.mockReturnValue(false);

    await command.run([], { folder: './data' });

    expect(consoleLogSpy).toHaveBeenCalledWith('❌ Invalid schema: 3');

    consoleLogSpy.mockRestore();
  });

  it('handles batch create errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    coreApiServiceFake.api.tableSchema.mockResolvedValue({
      data: mockPostSchema,
    });
    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'No dependencies',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    mockReaddir.mockResolvedValue(['post-1.json'] as any);
    mockReadFile.mockResolvedValue(
      '{"id": "post-1", "data": {"title": "Hello World"}}',
    );

    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    coreApiServiceFake.api.createRows.mockResolvedValue({
      error: { message: 'Validation failed' },
    });

    await command.run([], { folder: './data', tables: 'posts' });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Failed to process table posts:',
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it('continues processing when table fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    coreApiServiceFake.api.tableSchema
      .mockResolvedValueOnce({ data: mockUserSchema })
      .mockResolvedValueOnce({ data: mockPostSchema })
      .mockResolvedValueOnce({ data: mockPostSchema })
      .mockRejectedValueOnce(new Error('Schema not found'));

    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts', 'users'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'posts → users',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    mockReaddir.mockResolvedValueOnce(['post-1.json'] as any);

    mockReadFile.mockResolvedValueOnce(
      '{"id": "post-1", "data": {"title": "Hello World"}}',
    );

    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    coreApiServiceFake.api.createRows.mockResolvedValue({
      data: { rows: [{ id: 'post-1' }] },
    });

    await command.run([], { folder: './data', tables: 'posts,users' });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Failed to process table users:',
      expect.any(Error),
    );

    expect(mockReadFile).toHaveBeenCalledWith(
      'data/posts/post-1.json',
      'utf-8',
    );

    consoleErrorSpy.mockRestore();
  });

  it('handles circular dependency warnings', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    setupSuccessfulFlow();
    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['users', 'posts'],
      warnings: ['Circular dependency detected: users ↔ posts'],
    });

    await command.run([], { folder: './data' });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Circular dependency detected: users ↔ posts',
    );

    consoleWarnSpy.mockRestore();
  });

  it('handles table filter with whitespace correctly', async () => {
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    coreApiServiceFake.api.tableSchema.mockResolvedValue({
      data: mockUserSchema,
    });

    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['users', 'posts', 'comments'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'No dependencies',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    mockReaddir.mockResolvedValue(['row-1.json'] as any);
    mockReadFile.mockResolvedValue('{"id": "row-1", "data": {"name": "Test"}}');

    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    coreApiServiceFake.api.createRows.mockResolvedValue({
      data: { rows: [{ id: 'new-row' }] },
    });

    await command.run([], {
      folder: './data',
      tables: ' users , posts , comments ',
    });

    expect(coreApiServiceFake.api.tableSchema).toHaveBeenCalledWith(
      'revision-123',
      'users',
    );
    expect(coreApiServiceFake.api.tableSchema).toHaveBeenCalledWith(
      'revision-123',
      'posts',
    );
    expect(coreApiServiceFake.api.tableSchema).toHaveBeenCalledWith(
      'revision-123',
      'comments',
    );
  });

  it('parses folder option correctly', () => {
    const result = command.parseFolder('./test-data');
    expect(result).toBe('./test-data');
  });

  it('parses tables option correctly', () => {
    const result = command.parseTables('users,posts,comments');
    expect(result).toBe('users,posts,comments');
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

      await command.run([], { folder: './data', commit: true });

      expect(commitRevisionServiceFake.handleCommitFlow).toHaveBeenCalledWith(
        { folder: './data', commit: true },
        'Uploaded',
        expect.any(Number),
      );
    });

    it('calls commitRevisionService when commit is false', async () => {
      setupSuccessfulFlow();
      commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

      await command.run([], { folder: './data', commit: false });

      expect(commitRevisionServiceFake.handleCommitFlow).toHaveBeenCalledWith(
        { folder: './data', commit: false },
        'Uploaded',
        expect.any(Number),
      );
    });

    it('calls commitRevisionService with zero changes when no data uploaded', async () => {
      coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
      draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
        'revision-123',
      );
      mockReaddir.mockResolvedValueOnce([] as any);
      tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
        sortedTables: [],
        warnings: [],
      });
      tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
        'No dependencies',
      );
      commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

      await command.run([], {
        folder: './empty-data',
        commit: true,
      });

      expect(commitRevisionServiceFake.handleCommitFlow).toHaveBeenCalledWith(
        { folder: './empty-data', commit: true },
        'Uploaded',
        0,
      );
    });
  });

  describe('pagination', () => {
    it('fetches all existing rows using pagination', async () => {
      coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
      draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
        'revision-123',
      );

      coreApiServiceFake.api.tableSchema.mockResolvedValue({
        data: mockPostSchema,
      });
      tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
        sortedTables: ['posts'],
        warnings: [],
      });
      tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
        'No dependencies',
      );

      jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
      mockValidation.mockReturnValue(true);

      mockReaddir.mockResolvedValue(['post-1.json'] as any);
      mockReadFile.mockResolvedValue(
        '{"id": "post-1", "data": {"title": "Hello World"}}',
      );

      coreApiServiceFake.api.rows
        .mockResolvedValueOnce({
          data: {
            edges: [
              { node: { id: 'existing-1', data: { title: 'Existing 1' } } },
            ],
            pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
          },
        })
        .mockResolvedValueOnce({
          data: {
            edges: [
              { node: { id: 'existing-2', data: { title: 'Existing 2' } } },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        });

      coreApiServiceFake.api.createRows.mockResolvedValue({
        data: { rows: [{ id: 'post-1' }] },
      });

      await command.run([], { folder: './data', tables: 'posts' });

      expect(coreApiServiceFake.api.rows).toHaveBeenCalledTimes(2);
      expect(coreApiServiceFake.api.rows).toHaveBeenNthCalledWith(
        1,
        'revision-123',
        'posts',
        {
          first: 100,
          after: undefined,
          orderBy: [{ field: 'id', direction: 'asc' }],
        },
      );
      expect(coreApiServiceFake.api.rows).toHaveBeenNthCalledWith(
        2,
        'revision-123',
        'posts',
        {
          first: 100,
          after: 'cursor1',
          orderBy: [{ field: 'id', direction: 'asc' }],
        },
      );
    });
  });
});
