import { Test, TestingModule } from '@nestjs/testing';
import { PreviewPatchesCommand } from '../preview-patches.command';
import { PatchDiffService } from '../../services/patch-diff.service';
import { PatchLoaderService } from '../../services/patch-loader.service';
import { PatchValidationService } from '../../services/patch-validation.service';
import { CoreApiService } from '../../services/core-api.service';
import { DraftRevisionService } from '../../services/draft-revision.service';
import { PatchFile } from '../../types/patch.types';

describe('PreviewPatchesCommand', () => {
  let command: PreviewPatchesCommand;
  let diffServiceFake: {
    compareWithApi: jest.Mock;
  };
  let loaderServiceFake: {
    loadPatches: jest.Mock;
  };
  let validationServiceFake: {
    validateAll: jest.Mock;
    validateAllWithRevisionId: jest.Mock;
  };
  let coreApiServiceFake: {
    tryToLogin: jest.Mock;
  };
  let draftRevisionServiceFake: {
    getDraftRevisionId: jest.Mock;
  };

  const mockPatches: PatchFile[] = [
    {
      version: '1.0',
      table: 'Article',
      rowId: 'row-1',
      createdAt: '2025-10-15T12:00:00Z',
      patches: [{ op: 'replace', path: 'title', value: 'New Title' }],
    },
  ];

  beforeEach(async () => {
    diffServiceFake = {
      compareWithApi: jest.fn(),
    };

    loaderServiceFake = {
      loadPatches: jest.fn(),
    };

    validationServiceFake = {
      validateAll: jest.fn(),
      validateAllWithRevisionId: jest.fn(),
    };

    coreApiServiceFake = {
      tryToLogin: jest.fn(),
    };

    draftRevisionServiceFake = {
      getDraftRevisionId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreviewPatchesCommand,
        { provide: PatchDiffService, useValue: diffServiceFake },
        { provide: PatchLoaderService, useValue: loaderServiceFake },
        { provide: PatchValidationService, useValue: validationServiceFake },
        { provide: CoreApiService, useValue: coreApiServiceFake },
        { provide: DraftRevisionService, useValue: draftRevisionServiceFake },
      ],
    }).compile();

    command = module.get<PreviewPatchesCommand>(PreviewPatchesCommand);

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

  it('loads and validates patches', async () => {
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

  it('compares patches with API', async () => {
    setupSuccessfulFlow();

    await command.run([], { input: './patches' });

    expect(draftRevisionServiceFake.getDraftRevisionId).toHaveBeenCalledWith({
      input: './patches',
    });
    expect(diffServiceFake.compareWithApi).toHaveBeenCalledWith(
      mockPatches,
      'revision-123',
    );
  });

  it('shows no changes message when no changes detected', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [],
      summary: {
        totalRows: 1,
        totalChanges: 0,
        skipped: 1,
        errors: 0,
      },
    });

    await command.run([], { input: './patches' });

    expect(consoleSpy).toHaveBeenCalledWith(
      '✅ No changes detected. All values are identical to current data.',
    );

    consoleSpy.mockRestore();
  });

  it('displays diff with summary', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();

    await command.run([], { input: './patches' });

    const calls = consoleSpy.mock.calls.map(
      (call) => call[0] as string | undefined,
    );
    const hasSummary = calls.some((call) =>
      String(call).includes('📊 Summary:'),
    );
    expect(hasSummary).toBe(true);

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
    ]);
    diffServiceFake.compareWithApi.mockResolvedValue({
      table: 'Article',
      rows: [
        {
          rowId: 'row-1',
          patches: [
            {
              path: 'title',
              currentValue: 'Old Title',
              newValue: 'New Title',
              op: 'replace',
              status: 'CHANGE',
            },
          ],
        },
      ],
      summary: {
        totalRows: 1,
        totalChanges: 1,
        skipped: 0,
        errors: 0,
      },
    });
  }
});
