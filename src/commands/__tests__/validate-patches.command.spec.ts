import { Test, TestingModule } from '@nestjs/testing';
import { ValidatePatchesCommand } from '../validate-patches.command';
import { PatchLoaderService } from '../../services/patch-loader.service';
import { PatchValidationService } from '../../services/patch-validation.service';
import { ConnectionService } from '../../services/connection.service';
import { PatchFile, ValidationResult } from '../../types/patch.types';

describe('ValidatePatchesCommand', () => {
  let command: ValidatePatchesCommand;
  let loaderServiceFake: {
    loadPatches: jest.Mock<Promise<PatchFile[]>, [string]>;
  };
  let validationServiceFake: {
    validateAllWithRevisionId: jest.Mock<
      Promise<ValidationResult[]>,
      [PatchFile[], string]
    >;
  };
  let connectionServiceFake: {
    connect: jest.Mock<Promise<void>, [unknown]>;
    draftRevisionId: string;
  };

  const mockPatchFile: PatchFile = {
    version: '1.0',
    table: 'Article',
    rowId: 'row-1',
    createdAt: '2025-10-14T12:00:00Z',
    patches: [{ op: 'replace', path: 'title', value: 'New Title' }],
  };

  beforeEach(async () => {
    loaderServiceFake = {
      loadPatches: jest.fn<Promise<PatchFile[]>, [string]>(),
    };

    validationServiceFake = {
      validateAllWithRevisionId: jest.fn<
        Promise<ValidationResult[]>,
        [PatchFile[], string]
      >(),
    };

    connectionServiceFake = {
      connect: jest.fn<Promise<void>, [unknown]>(),
      draftRevisionId: 'revision-123',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidatePatchesCommand,
        { provide: PatchLoaderService, useValue: loaderServiceFake },
        { provide: PatchValidationService, useValue: validationServiceFake },
        { provide: ConnectionService, useValue: connectionServiceFake },
      ],
    }).compile();

    command = module.get<ValidatePatchesCommand>(ValidatePatchesCommand);

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
    loaderServiceFake.loadPatches.mockResolvedValue([mockPatchFile]);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
    ]);

    await command.run([], { input: './patches' });

    expect(connectionServiceFake.connect).toHaveBeenCalled();
  });

  it('loads patches from specified input path', async () => {
    loaderServiceFake.loadPatches.mockResolvedValue([mockPatchFile]);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
    ]);

    await command.run([], { input: './test-patches' });

    expect(loaderServiceFake.loadPatches).toHaveBeenCalledWith(
      './test-patches',
    );
  });

  it('validates all loaded patches', async () => {
    const patches = [mockPatchFile];
    loaderServiceFake.loadPatches.mockResolvedValue(patches);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
    ]);

    await command.run([], { input: './patches' });

    expect(
      validationServiceFake.validateAllWithRevisionId,
    ).toHaveBeenCalledWith(patches, 'revision-123');
  });

  it('logs success when all patches are valid', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    loaderServiceFake.loadPatches.mockResolvedValue([mockPatchFile]);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      { valid: true, errors: [] },
    ]);

    await command.run([], { input: './patches' });

    expect(consoleSpy).toHaveBeenCalledWith('✅ Valid: Article/row-1');
    expect(consoleSpy).toHaveBeenCalledWith('\n✅ All patches are valid');

    consoleSpy.mockRestore();
  });

  it('logs errors and exits when patches are invalid', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const processExitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    loaderServiceFake.loadPatches.mockResolvedValue([mockPatchFile]);
    validationServiceFake.validateAllWithRevisionId.mockResolvedValue([
      {
        valid: false,
        errors: [
          {
            rowId: 'row-1',
            path: 'title',
            message: 'Invalid type',
          },
        ],
      },
    ]);

    await command.run([], { input: './patches' });

    expect(consoleSpy).toHaveBeenCalledWith('❌ Invalid: Article/row-1');
    expect(consoleSpy).toHaveBeenCalledWith('   - Invalid type [title]');
    expect(consoleErrorSpy).toHaveBeenCalledWith('\n❌ Validation failed');
    expect(processExitSpy).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('parses input option correctly', () => {
    const result = command.parseInput('./test-input');
    expect(result).toBe('./test-input');
  });
});
