import { Test, TestingModule } from '@nestjs/testing';
import { ApplyPatchesCommand } from '../apply-patches.command';
import { PatchLoaderService } from 'src/services/patch-loader.service';
import { PatchValidationService } from 'src/services/patch-validation.service';
import { PatchDiffService } from 'src/services/patch-diff.service';
import { ConnectionService } from 'src/services/connection.service';
import { CommitRevisionService } from 'src/services/commit-revision.service';
import { PatchFile } from 'src/types/patch.types';

describe('ApplyPatchesCommand', () => {
  let command: ApplyPatchesCommand;
  let loaderServiceFake: {
    loadPatches: jest.Mock;
  };
  let validationServiceFake: {
    validateAllWithRevisionId: jest.Mock;
  };
  let diffServiceFake: {
    compareWithApi: jest.Mock;
  };
  let connectionServiceFake: {
    connect: jest.Mock;
    draftRevisionId: string;
    bulkPatchSupported: boolean | undefined;
    api: {
      patchRow: jest.Mock;
      patchRows: jest.Mock;
    };
  };
  let commitRevisionServiceFake: {
    handleCommitFlow: jest.Mock;
  };

  const mockPatches: PatchFile[] = [
    {
      version: '1.0',
      table: 'Article',
      rowId: 'row-1',
      createdAt: '2025-10-15T12:00:00Z',
      patches: [{ op: 'replace', path: 'title', value: 'New Title' }],
    },
    {
      version: '1.0',
      table: 'Article',
      rowId: 'row-2',
      createdAt: '2025-10-15T12:00:00Z',
      patches: [{ op: 'replace', path: 'status', value: 'published' }],
    },
  ];

  beforeEach(async () => {
    loaderServiceFake = {
      loadPatches: jest.fn(),
    };

    validationServiceFake = {
      validateAllWithRevisionId: jest.fn(),
    };

    diffServiceFake = {
      compareWithApi: jest.fn(),
    };

    connectionServiceFake = {
      connect: jest.fn(),
      draftRevisionId: 'revision-123',
      bulkPatchSupported: undefined,
      api: {
        patchRow: jest.fn(),
        patchRows: jest.fn(),
      },
    };

    commitRevisionServiceFake = {
      handleCommitFlow: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplyPatchesCommand,
        { provide: PatchLoaderService, useValue: loaderServiceFake },
        { provide: PatchValidationService, useValue: validationServiceFake },
        { provide: PatchDiffService, useValue: diffServiceFake },
        { provide: ConnectionService, useValue: connectionServiceFake },
        { provide: CommitRevisionService, useValue: commitRevisionServiceFake },
      ],
    }).compile();

    command = module.get<ApplyPatchesCommand>(ApplyPatchesCommand);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws error when input option is missing', async () => {
    await expect(
      command.run([], {} as Parameters<typeof command.run>[1]),
    ).rejects.toThrow('Error: --input option is required');
  });

  it('authenticates before loading patches', async () => {
    setupSuccessfulFlow();

    await command.run([], { input: './patches' });

    expect(connectionServiceFake.connect).toHaveBeenCalled();
  });

  it('loads and validates patches before applying', async () => {
    setupSuccessfulFlow();

    await command.run([], { input: './patches' });

    expect(loaderServiceFake.loadPatches).toHaveBeenCalledWith('./patches');
    expect(
      validationServiceFake.validateAllWithRevisionId,
    ).toHaveBeenCalledWith(mockPatches, 'revision-123');
  });

  it('exits when validation fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      {
        valid: false,
        errors: [{ message: 'Invalid path', path: 'title' }],
      },
      { valid: true, errors: [] },
    ]);

    try {
      await command.run([], { input: './patches' });
    } catch {
      // Expected to throw because of mocked process.exit
    }

    expect(consoleSpy).toHaveBeenCalledWith(
      '❌ Validation failed for Article/row-1:',
    );
    expect(mockExit).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    mockExit.mockRestore();
  });

  it('applies patches to API using bulk patchRows', async () => {
    setupSuccessfulFlow();

    await command.run([], { input: './patches' });

    expect(connectionServiceFake.api.patchRows).toHaveBeenCalledTimes(1);
    expect(connectionServiceFake.api.patchRows).toHaveBeenCalledWith(
      'revision-123',
      'Article',
      {
        rows: [
          {
            rowId: 'row-1',
            patches: [{ op: 'replace', path: 'title', value: 'New Title' }],
          },
          {
            rowId: 'row-2',
            patches: [{ op: 'replace', path: 'status', value: 'published' }],
          },
        ],
      },
    );
  });

  it('falls back to single-row mode on 404', async () => {
    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [{ path: 'title', status: 'CHANGE' }],
        },
        {
          rowId: 'row-2',
          patches: [{ path: 'status', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 2,
        totalChanges: 2,
        skipped: 0,
        errors: 0,
      },
    });
    connectionServiceFake.api.patchRows.mockResolvedValue({
      error: { status: 404 },
    });
    connectionServiceFake.api.patchRow.mockResolvedValue({ data: {} });
    commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

    await command.run([], { input: './patches' });

    expect(connectionServiceFake.api.patchRows).toHaveBeenCalledTimes(1);
    expect(connectionServiceFake.api.patchRow).toHaveBeenCalledTimes(2);
    expect(connectionServiceFake.bulkPatchSupported).toBe(false);
  });

  it('exits early when no changes detected', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [],
      summary: {
        totalRows: 2,
        totalChanges: 0,
        skipped: 2,
        errors: 0,
      },
    });

    await command.run([], { input: './patches' });

    expect(consoleSpy).toHaveBeenCalledWith(
      '✅ No changes detected. All values are identical to current data.',
    );
    expect(connectionServiceFake.api.patchRows).not.toHaveBeenCalled();
    expect(connectionServiceFake.api.patchRow).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('skips rows without changes', async () => {
    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [{ path: 'title', status: 'SKIP' }],
        },
        {
          rowId: 'row-2',
          patches: [{ path: 'status', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 2,
        totalChanges: 1,
        skipped: 1,
        errors: 0,
      },
    });
    connectionServiceFake.api.patchRows.mockResolvedValue({ data: {} });
    commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

    await command.run([], { input: './patches' });

    expect(connectionServiceFake.api.patchRows).toHaveBeenCalledTimes(1);
    expect(connectionServiceFake.api.patchRows).toHaveBeenCalledWith(
      'revision-123',
      'Article',
      {
        rows: [
          {
            rowId: 'row-2',
            patches: [{ op: 'replace', path: 'status', value: 'published' }],
          },
        ],
      },
    );
  });

  it('exits when API returns errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [{ path: 'title', status: 'CHANGE' }],
        },
        {
          rowId: 'row-2',
          patches: [{ path: 'status', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 2,
        totalChanges: 2,
        skipped: 0,
        errors: 0,
      },
    });
    connectionServiceFake.api.patchRows.mockResolvedValue({
      error: { message: 'API error' },
    });

    try {
      await command.run([], { input: './patches' });
    } catch {
      // Expected to throw because of mocked process.exit
    }

    expect(mockExit).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    mockExit.mockRestore();
  });

  it('handles commit flow after successful application', async () => {
    setupSuccessfulFlow();

    await command.run([], { input: './patches', commit: true });

    expect(commitRevisionServiceFake.handleCommitFlow).toHaveBeenCalledWith(
      true,
      'Applied patches',
      2,
    );
  });

  it('groups patches by table', async () => {
    const multiTablePatches: PatchFile[] = [
      {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-15T12:00:00Z',
        patches: [{ op: 'replace', path: 'title', value: 'Article Title' }],
      },
      {
        version: '1.0',
        table: 'Author',
        rowId: 'row-2',
        createdAt: '2025-10-15T12:00:00Z',
        patches: [{ op: 'replace', path: 'name', value: 'Author Name' }],
      },
    ];

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    loaderServiceFake.loadPatches.mockResolvedValue(multiTablePatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [{ path: 'title', status: 'CHANGE' }],
        },
        {
          rowId: 'row-2',
          patches: [{ path: 'name', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 2,
        totalChanges: 2,
        skipped: 0,
        errors: 0,
      },
    });
    connectionServiceFake.api.patchRows.mockResolvedValue({ data: {} });
    commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

    await command.run([], { input: './patches' });

    const logCalls = consoleSpy.mock.calls.map((call) => call[0] as string);
    expect(
      logCalls.some((call) =>
        String(call).includes('Applying patches to table: Article'),
      ),
    ).toBe(true);
    expect(
      logCalls.some((call) =>
        String(call).includes('Applying patches to table: Author'),
      ),
    ).toBe(true);

    consoleSpy.mockRestore();
  });

  it('displays statistics summary', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();

    await command.run([], { input: './patches' });

    const logCalls = consoleSpy.mock.calls.map((call) => call[0] as string);
    expect(
      logCalls.some((call) => String(call).includes('📊 Apply Summary:')),
    ).toBe(true);
    expect(logCalls.some((call) => String(call).includes('Total rows:'))).toBe(
      true,
    );
    expect(logCalls.some((call) => String(call).includes('✅ Applied:'))).toBe(
      true,
    );

    consoleSpy.mockRestore();
  });

  it('logs correct count when some batches fail', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const manyPatches: PatchFile[] = Array.from({ length: 3 }, (_, i) => ({
      version: '1.0',
      table: 'Article',
      rowId: `row-${i + 1}`,
      createdAt: '2025-10-15T12:00:00Z',
      patches: [{ op: 'replace', path: 'title', value: `Title ${i + 1}` }],
    }));

    loaderServiceFake.loadPatches.mockResolvedValue(manyPatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue(
      manyPatches.map(() => ({ valid: true, errors: [] })),
    );
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: manyPatches.map((p) => ({
        rowId: p.rowId,
        patches: [{ path: 'title', status: 'CHANGE' }],
      })),
      summary: {
        totalRows: 3,
        totalChanges: 3,
        skipped: 0,
        errors: 0,
      },
    });

    connectionServiceFake.api.patchRows
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ error: { message: 'Server error' } });

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    try {
      await command.run([], { input: './patches', batchSize: 2 });
    } catch {
      // Expected
    }

    const logCalls = consoleSpy.mock.calls.map((call) => call[0] as string);
    expect(
      logCalls.some((call) => String(call).includes('Applied 2 rows')),
    ).toBe(true);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    mockExit.mockRestore();
  });

  it('uses single-row mode when bulkPatchSupported is false', async () => {
    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [{ path: 'title', status: 'CHANGE' }],
        },
        {
          rowId: 'row-2',
          patches: [{ path: 'status', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 2,
        totalChanges: 2,
        skipped: 0,
        errors: 0,
      },
    });

    connectionServiceFake.bulkPatchSupported = false;
    connectionServiceFake.api.patchRow.mockResolvedValue({ data: {} });
    commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

    await command.run([], { input: './patches' });

    expect(connectionServiceFake.api.patchRows).not.toHaveBeenCalled();
    expect(connectionServiceFake.api.patchRow).toHaveBeenCalledTimes(2);
  });

  it('logs correct single-row count when some rows fail', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [{ path: 'title', status: 'CHANGE' }],
        },
        {
          rowId: 'row-2',
          patches: [{ path: 'status', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 2,
        totalChanges: 2,
        skipped: 0,
        errors: 0,
      },
    });

    connectionServiceFake.bulkPatchSupported = false;
    connectionServiceFake.api.patchRow
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ error: { message: 'Failed' } });

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    try {
      await command.run([], { input: './patches' });
    } catch {
      // Expected
    }

    const logCalls = consoleSpy.mock.calls.map((call) => call[0] as string);
    expect(
      logCalls.some((call) =>
        String(call).includes('Applied 1 rows (single-row mode)'),
      ),
    ).toBe(true);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    mockExit.mockRestore();
  });

  it('falls back to single-row mode on 404 exception', async () => {
    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [{ path: 'title', status: 'CHANGE' }],
        },
        {
          rowId: 'row-2',
          patches: [{ path: 'status', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 2,
        totalChanges: 2,
        skipped: 0,
        errors: 0,
      },
    });
    connectionServiceFake.api.patchRows.mockRejectedValue({ status: 404 });
    connectionServiceFake.api.patchRow.mockResolvedValue({ data: {} });
    commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

    await command.run([], { input: './patches' });

    expect(connectionServiceFake.api.patchRows).toHaveBeenCalledTimes(1);
    expect(connectionServiceFake.api.patchRow).toHaveBeenCalledTimes(2);
    expect(connectionServiceFake.bulkPatchSupported).toBe(false);
  });

  it('handles batch patchRows with no data returned', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [{ path: 'title', status: 'CHANGE' }],
        },
        {
          rowId: 'row-2',
          patches: [{ path: 'status', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 2,
        totalChanges: 2,
        skipped: 0,
        errors: 0,
      },
    });
    connectionServiceFake.api.patchRows.mockResolvedValue({});

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    try {
      await command.run([], { input: './patches' });
    } catch {
      // Expected
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '\n❌ Batch patch failed: No data returned from API',
    );

    consoleErrorSpy.mockRestore();
    mockExit.mockRestore();
  });

  it('handles batch exception that is not 404', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [{ path: 'title', status: 'CHANGE' }],
        },
        {
          rowId: 'row-2',
          patches: [{ path: 'status', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 2,
        totalChanges: 2,
        skipped: 0,
        errors: 0,
      },
    });
    connectionServiceFake.api.patchRows.mockRejectedValue(
      new Error('Network error'),
    );

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    try {
      await command.run([], { input: './patches' });
    } catch {
      // Expected
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '\n❌ Batch patch exception:',
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
    mockExit.mockRestore();
  });

  it('skips rows with empty patches array', async () => {
    const patchesWithEmpty: PatchFile[] = [
      {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-15T12:00:00Z',
        patches: [],
      },
      {
        version: '1.0',
        table: 'Article',
        rowId: 'row-2',
        createdAt: '2025-10-15T12:00:00Z',
        patches: [{ op: 'replace', path: 'status', value: 'published' }],
      },
    ];

    loaderServiceFake.loadPatches.mockResolvedValue(patchesWithEmpty);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [],
        },
        {
          rowId: 'row-2',
          patches: [{ path: 'status', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 2,
        totalChanges: 1,
        skipped: 1,
        errors: 0,
      },
    });
    connectionServiceFake.api.patchRows.mockResolvedValue({ data: {} });
    commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

    await command.run([], { input: './patches' });

    expect(connectionServiceFake.api.patchRows).toHaveBeenCalledWith(
      'revision-123',
      'Article',
      {
        rows: [
          {
            rowId: 'row-2',
            patches: [{ op: 'replace', path: 'status', value: 'published' }],
          },
        ],
      },
    );
  });

  it('handles single-row apply exception', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    loaderServiceFake.loadPatches.mockResolvedValue([mockPatches[0]]);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [{ path: 'title', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 1,
        totalChanges: 1,
        skipped: 0,
        errors: 0,
      },
    });

    connectionServiceFake.bulkPatchSupported = false;
    connectionServiceFake.api.patchRow.mockRejectedValue(
      new Error('Connection failed'),
    );

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    try {
      await command.run([], { input: './patches' });
    } catch {
      // Expected
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '    Exception: Connection failed',
    );

    consoleErrorSpy.mockRestore();
    mockExit.mockRestore();
  });

  it('handles single-row apply with no data returned', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    loaderServiceFake.loadPatches.mockResolvedValue([mockPatches[0]]);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [{ path: 'title', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 1,
        totalChanges: 1,
        skipped: 0,
        errors: 0,
      },
    });

    connectionServiceFake.bulkPatchSupported = false;
    connectionServiceFake.api.patchRow.mockResolvedValue({});

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    try {
      await command.run([], { input: './patches' });
    } catch {
      // Expected
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '    Error: No data returned from API',
    );

    consoleErrorSpy.mockRestore();
    mockExit.mockRestore();
  });

  it('parses input option correctly', () => {
    const result = command.parseInput('./test-patches');
    expect(result).toBe('./test-patches');
  });

  it('parses commit option correctly', () => {
    expect(command.parseCommit('true')).toBe(true);
    expect(command.parseCommit('false')).toBe(false);
    expect(command.parseCommit()).toBe(true);
  });

  it('parses batch-size option correctly', () => {
    expect(command.parseBatchSize('50')).toBe(50);
    expect(command.parseBatchSize('1')).toBe(1);
  });

  it('throws error for invalid batch-size option', () => {
    expect(() => command.parseBatchSize('0')).toThrow(
      'Batch size must be a positive integer',
    );
    expect(() => command.parseBatchSize('-1')).toThrow(
      'Batch size must be a positive integer',
    );
    expect(() => command.parseBatchSize('abc')).toThrow(
      'Batch size must be a positive integer',
    );
  });

  it('handles is404Error with non-object error', async () => {
    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [{ path: 'title', status: 'CHANGE' }],
        },
        {
          rowId: 'row-2',
          patches: [{ path: 'status', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 2,
        totalChanges: 2,
        skipped: 0,
        errors: 0,
      },
    });

    connectionServiceFake.api.patchRows.mockRejectedValue('string error');

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    try {
      await command.run([], { input: './patches' });
    } catch {
      // Expected
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '\n❌ Batch patch exception:',
      'string error',
    );

    consoleErrorSpy.mockRestore();
    mockExit.mockRestore();
  });

  it('handles empty patchFiles array in processBatchPatch', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const emptyPatches: PatchFile[] = [];

    loaderServiceFake.loadPatches.mockResolvedValue(emptyPatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [],
      summary: {
        totalRows: 0,
        totalChanges: 0,
        skipped: 0,
        errors: 0,
      },
    });

    await command.run([], { input: './patches' });

    expect(connectionServiceFake.api.patchRows).not.toHaveBeenCalled();
    expect(connectionServiceFake.api.patchRow).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('handles table with all rows filtered out in applyAllPatches', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Patches from a different table than the diff table
    const patchesForDifferentTable: PatchFile[] = [
      {
        version: '1.0',
        table: 'OtherTable',
        rowId: 'row-1',
        createdAt: '2025-10-15T12:00:00Z',
        patches: [{ op: 'replace', path: 'title', value: 'New Title' }],
      },
    ];

    loaderServiceFake.loadPatches.mockResolvedValue(patchesForDifferentTable);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
    ]);
    // diff is for Article table, but patches are for OtherTable
    // This means rowsWithChanges won't match OtherTable:row-1
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [{ path: 'title', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 1,
        totalChanges: 1,
        skipped: 0,
        errors: 0,
      },
    });

    commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

    await command.run([], { input: './patches' });

    const logCalls = consoleSpy.mock.calls.map((call) => call[0] as string);
    // This message appears when rowsToApply is empty after filtering
    expect(
      logCalls.some((call) => String(call).includes('No changes to apply')),
    ).toBe(true);

    expect(connectionServiceFake.api.patchRows).not.toHaveBeenCalled();
    expect(connectionServiceFake.api.patchRow).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  function setupSuccessfulFlow() {
    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    connectionServiceFake.connect.mockResolvedValue(undefined);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [{ path: 'title', status: 'CHANGE' }],
        },
        {
          rowId: 'row-2',
          patches: [{ path: 'status', status: 'CHANGE' }],
        },
      ],
      summary: {
        totalRows: 2,
        totalChanges: 2,
        skipped: 0,
        errors: 0,
      },
    });
    connectionServiceFake.api.patchRows.mockResolvedValue({ data: {} });
    commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);
  }
});
