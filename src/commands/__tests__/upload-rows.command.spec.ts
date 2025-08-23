/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
    setupSuccessfulFlow();

    await command.run([], {
      folder: './data',
      tables: 'users,posts',
    });

    // Should not scan folder for directories
    expect(mockReaddir).not.toHaveBeenCalledWith('./data', {
      withFileTypes: true,
    });

    // Should process specified tables
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

    // Mock schema fetching - 2 calls for dependency analysis + 2 for table processing
    coreApiServiceFake.api.tableSchema
      .mockResolvedValueOnce({ data: mockUserSchema }) // dependency analysis
      .mockResolvedValueOnce({ data: mockPostSchema }) // dependency analysis
      .mockResolvedValueOnce({ data: mockUserSchema }) // users table processing
      .mockResolvedValueOnce({ data: mockPostSchema }); // posts table processing

    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts', 'users'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'posts → users',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    // Mock file operations for both tables
    mockReaddir
      .mockResolvedValueOnce(['post-1.json'] as any) // posts folder
      .mockResolvedValueOnce(['user-1.json'] as any); // users folder

    mockReadFile
      .mockResolvedValueOnce(
        '{"id": "post-1", "data": {"title": "Hello World"}}',
      )
      .mockResolvedValueOnce('{"id": "user-1", "data": {"name": "Alice"}}');

    coreApiServiceFake.api.row.mockResolvedValue({
      data: { id: 'existing', data: { same: 'data' } },
    });

    await command.run([], { folder: './data', tables: 'users,posts' });

    expect(coreApiServiceFake.api.tableSchema).toHaveBeenCalledTimes(4); // 2 for deps + 2 for upload
    expect(tableDependencyServiceFake.analyzeDependencies).toHaveBeenCalledWith(
      {
        users: mockUserSchema,
        posts: mockPostSchema,
      },
    );
  });

  it('displays dependency analysis information', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

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

    coreApiServiceFake.api.row.mockResolvedValue({
      data: { id: 'post-1', data: { title: 'Hello World' } },
    });

    await command.run([], { folder: './data', tables: 'posts,users' });

    expect(consoleSpy).toHaveBeenCalledWith('📊 Found 2 tables to process');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Dependency analysis: posts → users',
    );

    consoleSpy.mockRestore();
  });

  it('processes tables in dependency order', async () => {
    setupSuccessfulFlow();

    await command.run([], { folder: './data' });

    // Should process posts first (no dependencies), then users (depends on posts)
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
    expect(mockValidation).toHaveBeenCalledTimes(3); // 2 users + 1 post
  });

  it('creates new rows when they do not exist', async () => {
    // Simple setup for posts table only
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

    coreApiServiceFake.api.row.mockRejectedValue(new Error('Row not found'));
    coreApiServiceFake.api.createRow.mockResolvedValue({
      data: { id: 'new-row' },
    });

    await command.run([], { folder: './data', tables: 'posts' });

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

  it('updates existing rows when data is different', async () => {
    // Simple setup for posts table only
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

    coreApiServiceFake.api.row.mockResolvedValue({
      data: { id: 'post-1', data: { title: 'Old Title' } },
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
        data: { title: 'Hello World' },
        isRestore: true,
      },
    );
  });

  it('skips rows when data is identical', async () => {
    // Simple setup for posts table only
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

    // Mock that row already exists with identical data
    coreApiServiceFake.api.row.mockResolvedValue({
      data: { id: 'post-1', data: { title: 'Hello World' } },
    });

    await command.run([], { folder: './data', tables: 'posts' });

    expect(coreApiServiceFake.api.updateRow).not.toHaveBeenCalled();
    expect(coreApiServiceFake.api.createRow).not.toHaveBeenCalled();
  });

  it('tracks upload statistics correctly', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();

    // Mock mixed scenarios
    coreApiServiceFake.api.row
      .mockRejectedValueOnce(new Error('Not found')) // user-1: create
      .mockResolvedValueOnce({
        data: { id: 'user-2', data: { name: 'Different' } },
      }) // user-2: update
      .mockRejectedValueOnce(new Error('Not found')); // post-1: create

    coreApiServiceFake.api.createRow
      .mockResolvedValueOnce({ data: { id: 'user-1' } })
      .mockResolvedValueOnce({ data: { id: 'post-1' } });

    coreApiServiceFake.api.updateRow.mockResolvedValueOnce({
      data: { id: 'user-2' },
    });

    await command.run([], { folder: './data' });

    // Check final summary
    expect(consoleSpy).toHaveBeenCalledWith('\n🎉 Upload Summary:');
    expect(consoleSpy).toHaveBeenCalledWith('📊 Total rows processed: 3');
    expect(consoleSpy).toHaveBeenCalledWith('⬆️  Uploaded (new): 2');
    expect(consoleSpy).toHaveBeenCalledWith('🔄 Updated (changed): 1');
    expect(consoleSpy).toHaveBeenCalledWith('⏭️  Skipped (identical): 0');

    consoleSpy.mockRestore();
  });

  it('handles schema validation failures', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();
    mockValidation.mockReturnValue(false); // All validations fail

    await command.run([], { folder: './data' });

    expect(consoleLogSpy).toHaveBeenCalledWith('❌ Invalid schema: 3');

    consoleLogSpy.mockRestore();
  });

  it('handles create errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    setupSuccessfulFlow();
    coreApiServiceFake.api.row.mockRejectedValue(new Error('Not found'));
    coreApiServiceFake.api.createRow.mockResolvedValue({
      error: 'Validation failed',
    });

    await command.run([], { folder: './data' });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Create failed for row user-1:',
      'Validation failed',
    );

    consoleErrorSpy.mockRestore();
  });

  it('handles update errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    setupSuccessfulFlow();
    coreApiServiceFake.api.row.mockResolvedValue({
      data: { id: 'user-1', data: { name: 'Different' } },
    });
    coreApiServiceFake.api.updateRow.mockResolvedValue({
      error: 'Update failed',
    });

    await command.run([], { folder: './data' });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Update failed for row user-1:',
      'Update failed',
    );

    consoleErrorSpy.mockRestore();
  });

  it('continues processing when table fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );

    // Setup for dependency analysis
    coreApiServiceFake.api.tableSchema
      .mockResolvedValueOnce({ data: mockUserSchema }) // for dependency analysis
      .mockResolvedValueOnce({ data: mockPostSchema }) // for dependency analysis
      .mockResolvedValueOnce({ data: mockPostSchema }) // posts table processing succeeds
      .mockRejectedValueOnce(new Error('Schema not found')); // users table processing fails

    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts', 'users'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'posts → users',
    );

    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    // Mock file system - posts succeeds, users fails during schema fetch
    mockReaddir.mockResolvedValueOnce(['post-1.json'] as any); // posts folder

    mockReadFile.mockResolvedValueOnce(
      '{"id": "post-1", "data": {"title": "Hello World"}}',
    );

    coreApiServiceFake.api.row.mockRejectedValue(new Error('Not found'));
    coreApiServiceFake.api.createRow.mockResolvedValue({
      data: { id: 'post-1' },
    });

    await command.run([], { folder: './data', tables: 'posts,users' });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Failed to process table users:',
      expect.any(Error),
    );

    // Should still process posts table
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
    setupSuccessfulFlow();

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

  it('calculates success rate correctly', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    jest.clearAllMocks();

    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
    coreApiServiceFake.api.tableSchema.mockResolvedValue({
      data: mockUserSchema,
    });
    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['users'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'No dependencies',
    );

    const freshValidationMock = jest.fn().mockReturnValue(true);
    jsonValidatorServiceFake.validateSchema.mockReturnValue(
      freshValidationMock,
    );

    mockReaddir.mockResolvedValue([
      'user-1.json',
      'user-2.json',
      'user-3.json',
    ] as any);
    mockReadFile
      .mockResolvedValueOnce('{"id": "user-1", "data": {"name": "Alice"}}')
      .mockResolvedValueOnce('{"id": "user-2", "data": {"name": "Bob"}}')
      .mockResolvedValueOnce('{"id": "user-3", "data": {"name": "Charlie"}}');

    coreApiServiceFake.api.row.mockRejectedValue(new Error('Not found'));

    coreApiServiceFake.api.createRow.mockReset();
    coreApiServiceFake.api.createRow
      .mockResolvedValueOnce({ data: { id: 'user-1' } })
      .mockResolvedValueOnce({ data: { id: 'user-2' } })
      .mockResolvedValueOnce({ error: 'Create failed' });

    const testResult1: any = await coreApiServiceFake.api.createRow(
      'test',
      'test',
      {},
    );
    const testResult2: any = await coreApiServiceFake.api.createRow(
      'test',
      'test',
      {},
    );
    const testResult3: any = await coreApiServiceFake.api.createRow(
      'test',
      'test',
      {},
    );

    expect(testResult1).toEqual({ data: { id: 'user-1' } });
    expect(testResult2).toEqual({ data: { id: 'user-2' } });
    expect(testResult3).toEqual({ error: 'Create failed' });

    coreApiServiceFake.api.createRow.mockReset();
    coreApiServiceFake.api.createRow
      .mockResolvedValueOnce({ data: { id: 'user-1' } })
      .mockResolvedValueOnce({ data: { id: 'user-2' } })
      .mockResolvedValueOnce({ error: 'Create failed' });

    await command.run([], { folder: './data', tables: 'users' });

    const successRateCalls = consoleSpy.mock.calls.filter(
      (call) => call[0] && String(call[0]).includes('✅ Success rate:'),
    );
    expect(successRateCalls).toHaveLength(1);

    const successRateMessage = String(successRateCalls[0][0]);
    expect(successRateMessage).toMatch(
      /✅ Success rate: \d+\.\d+% \(\d+ total errors\)/,
    );

    consoleSpy.mockRestore();
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

  it('parses commit option correctly', () => {
    expect(command.parseCommit('true')).toBe(true);
    expect(command.parseCommit('false')).toBe(false);
    expect(command.parseCommit()).toBe(false);
  });

  describe('with commit option', () => {
    it('calls commitRevisionService when commit is true', async () => {
      setupSuccessfulFlow();
      commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

      await command.run([], { folder: './data', commit: true });

      expect(commitRevisionServiceFake.handleCommitFlow).toHaveBeenCalledWith(
        { folder: './data', commit: true },
        'Uploaded',
        2, // Based on setupSuccessfulFlow actual result
      );
    });

    it('calls commitRevisionService when commit is false', async () => {
      setupSuccessfulFlow();
      commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

      await command.run([], { folder: './data', commit: false });

      expect(commitRevisionServiceFake.handleCommitFlow).toHaveBeenCalledWith(
        { folder: './data', commit: false },
        'Uploaded',
        2, // Based on setupSuccessfulFlow actual result
      );
    });

    it('calls commitRevisionService with zero changes when no data uploaded', async () => {
      coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
      draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
        'revision-123',
      );
      mockReaddir.mockResolvedValueOnce([]);
      tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
        sortedTables: [],
        warnings: [],
      });
      tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
        'No dependencies',
      );
      commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

      await command.run([], { folder: './empty-data', commit: true });

      expect(commitRevisionServiceFake.handleCommitFlow).toHaveBeenCalledWith(
        { folder: './empty-data', commit: true },
        'Uploaded',
        0,
      );
    });
  });

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
    api: {
      tableSchema: jest.fn(),
      row: jest.fn(),
      createRow: jest.fn(),
      updateRow: jest.fn(),
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

    // Mock folder scanning
    mockReaddir
      .mockResolvedValueOnce([
        { name: 'users', isDirectory: () => true },
        { name: 'posts', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false },
      ] as any)
      // Mock row files in posts folder (processed first due to dependency order)
      .mockResolvedValueOnce(['post-1.json'] as any)
      // Mock row files in users folder (processed second)
      .mockResolvedValueOnce([
        'user-1.json',
        'user-2.json',
        'readme.txt',
      ] as any);

    // Mock schema fetching
    coreApiServiceFake.api.tableSchema
      .mockResolvedValueOnce({ data: mockUserSchema })
      .mockResolvedValueOnce({ data: mockPostSchema })
      .mockResolvedValueOnce({ data: mockUserSchema })
      .mockResolvedValueOnce({ data: mockPostSchema });

    // Mock dependency analysis
    tableDependencyServiceFake.analyzeDependencies.mockReturnValue({
      sortedTables: ['posts', 'users'],
      warnings: [],
    });
    tableDependencyServiceFake.formatDependencyInfo.mockReturnValue(
      'Dependency analysis: posts → users',
    );

    // Mock validation
    jsonValidatorServiceFake.validateSchema.mockReturnValue(mockValidation);
    mockValidation.mockReturnValue(true);

    // Mock file reading
    mockReadFile
      .mockResolvedValueOnce('{"id": "user-1", "data": {"name": "Alice"}}')
      .mockResolvedValueOnce('{"id": "user-2", "data": {"name": "Bob"}}')
      .mockResolvedValueOnce(
        '{"id": "post-1", "data": {"title": "Hello World"}}',
      );

    // Mock API calls
    coreApiServiceFake.api.row.mockResolvedValue({
      data: { id: 'user-1', data: { name: 'Alice' } },
    });
    coreApiServiceFake.api.createRow.mockResolvedValue({
      data: { id: 'new-row' },
    });
    coreApiServiceFake.api.updateRow.mockResolvedValue({
      data: { id: 'updated-row' },
    });

    // Mock console.log to capture output
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
});
