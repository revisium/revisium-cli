import { Test, TestingModule } from '@nestjs/testing';
import { ApplyPatchesCommand } from '../apply-patches.command';
import { PatchLoaderService } from 'src/services/patch-loader.service';
import { PatchValidationService } from 'src/services/patch-validation.service';
import { PatchDiffService } from 'src/services/patch-diff.service';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';
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
  let coreApiServiceFake: {
    tryToLogin: jest.Mock;
    bulkPatchSupported: boolean | undefined;
    api: {
      patchRow: jest.Mock;
      patchRows: jest.Mock;
    };
  };
  let draftRevisionServiceFake: {
    getDraftRevisionId: jest.Mock;
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

    coreApiServiceFake = {
      tryToLogin: jest.fn(),
      bulkPatchSupported: undefined,
      api: {
        patchRow: jest.fn(),
        patchRows: jest.fn(),
      },
    };

    draftRevisionServiceFake = {
      getDraftRevisionId: jest.fn(),
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
        { provide: CoreApiService, useValue: coreApiServiceFake },
        { provide: DraftRevisionService, useValue: draftRevisionServiceFake },
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

    expect(coreApiServiceFake.tryToLogin).toHaveBeenCalled();
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
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
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

    expect(coreApiServiceFake.api.patchRows).toHaveBeenCalledTimes(1);
    expect(coreApiServiceFake.api.patchRows).toHaveBeenCalledWith(
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
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
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
    coreApiServiceFake.api.patchRows.mockResolvedValue({
      error: { status: 404 },
    });
    coreApiServiceFake.api.patchRow.mockResolvedValue({ data: {} });
    commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

    await command.run([], { input: './patches' });

    expect(coreApiServiceFake.api.patchRows).toHaveBeenCalledTimes(1);
    expect(coreApiServiceFake.api.patchRow).toHaveBeenCalledTimes(2);
    expect(coreApiServiceFake.bulkPatchSupported).toBe(false);
  });

  it('exits early when no changes detected', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
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
    expect(coreApiServiceFake.api.patchRows).not.toHaveBeenCalled();
    expect(coreApiServiceFake.api.patchRow).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('skips rows without changes', async () => {
    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
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
    coreApiServiceFake.api.patchRows.mockResolvedValue({ data: {} });
    commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);

    await command.run([], { input: './patches' });

    expect(coreApiServiceFake.api.patchRows).toHaveBeenCalledTimes(1);
    expect(coreApiServiceFake.api.patchRows).toHaveBeenCalledWith(
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
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
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
    coreApiServiceFake.api.patchRows.mockResolvedValue({
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
      { input: './patches', commit: true },
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
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
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
    coreApiServiceFake.api.patchRows.mockResolvedValue({ data: {} });
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

  function setupSuccessfulFlow() {
    loaderServiceFake.loadPatches.mockResolvedValue(mockPatches);
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
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
    coreApiServiceFake.api.patchRows.mockResolvedValue({ data: {} });
    commitRevisionServiceFake.handleCommitFlow.mockResolvedValue(undefined);
  }
});
