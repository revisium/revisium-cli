import { Test, TestingModule } from '@nestjs/testing';
import { SavePatchesCommand } from '../save-patches.command';
import { PatchGeneratorService } from '../../services/patch-generator.service';
import { PatchLoaderService } from '../../services/patch-loader.service';
import { CoreApiService } from '../../services/core-api.service';
import { DraftRevisionService } from '../../services/draft-revision.service';
import { JsonSchema, JsonValuePatch } from '@revisium/schema-toolkit/types';
import { PatchFile } from '../../types/patch.types';

describe('SavePatchesCommand', () => {
  let command: SavePatchesCommand;
  let generatorServiceFake: {
    getAllPaths: jest.Mock<string[], [JsonSchema]>;
    generatePatches: jest.Mock<
      JsonValuePatch[],
      [unknown, string[], JsonSchema]
    >;
  };
  let loaderServiceFake: {
    savePatchesAsSeparateFiles: jest.Mock<Promise<void>, [PatchFile[], string]>;
    savePatchesAsMergedFile: jest.Mock<Promise<void>, [PatchFile[], string]>;
  };
  let coreApiServiceFake: {
    tryToLogin: jest.Mock<Promise<void>, [unknown]>;
    api: {
      tableSchema: jest.Mock;
      rows: jest.Mock;
    };
  };
  let draftRevisionServiceFake: {
    getDraftRevisionId: jest.Mock<
      Promise<string>,
      [{ organization?: string; project?: string; branch?: string }]
    >;
  };

  const mockRows = [
    {
      id: 'row-1',
      data: { title: 'Title 1', status: 'published' },
    },
    {
      id: 'row-2',
      data: { title: 'Title 2', status: 'draft' },
    },
  ];

  beforeEach(async () => {
    generatorServiceFake = {
      getAllPaths: jest.fn<string[], [JsonSchema]>(),
      generatePatches: jest.fn<
        JsonValuePatch[],
        [unknown, string[], JsonSchema]
      >(),
    };

    loaderServiceFake = {
      savePatchesAsSeparateFiles: jest.fn<
        Promise<void>,
        [PatchFile[], string]
      >(),
      savePatchesAsMergedFile: jest.fn<Promise<void>, [PatchFile[], string]>(),
    };

    coreApiServiceFake = {
      tryToLogin: jest.fn<Promise<void>, [unknown]>(),
      api: {
        tableSchema: jest.fn(),
        rows: jest.fn(),
      },
    };

    draftRevisionServiceFake = {
      getDraftRevisionId: jest.fn<
        Promise<string>,
        [{ organization?: string; project?: string; branch?: string }]
      >(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavePatchesCommand,
        { provide: PatchGeneratorService, useValue: generatorServiceFake },
        { provide: PatchLoaderService, useValue: loaderServiceFake },
        { provide: CoreApiService, useValue: coreApiServiceFake },
        { provide: DraftRevisionService, useValue: draftRevisionServiceFake },
      ],
    }).compile();

    command = module.get<SavePatchesCommand>(SavePatchesCommand);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws error when table option is missing', async () => {
    await expect(
      command.run([], {
        output: './patches',
      } as Parameters<typeof command.run>[1]),
    ).rejects.toThrow('Error: --table option is required');
  });

  it('throws error when output option is missing', async () => {
    await expect(
      command.run([], {
        table: 'Article',
      } as Parameters<typeof command.run>[1]),
    ).rejects.toThrow('Error: --output option is required');
  });

  it('throws error when paths option is missing', async () => {
    await expect(
      command.run([], {
        table: 'Article',
        output: './patches',
      } as Parameters<typeof command.run>[1]),
    ).rejects.toThrow('Error: --paths option is required');
  });

  it('authenticates before fetching data', async () => {
    setupSuccessfulFlow();

    await command.run([], {
      table: 'Article',
      paths: 'title',
      output: './patches',
    });

    expect(coreApiServiceFake.tryToLogin).toHaveBeenCalled();
  });

  it('resolves revision ID from options', async () => {
    setupSuccessfulFlow();
    const options = {
      table: 'Article',
      paths: 'title',
      output: './patches',
      organization: 'test-org',
      project: 'test-project',
      branch: 'main',
    };

    await command.run([], options);

    expect(draftRevisionServiceFake.getDraftRevisionId).toHaveBeenCalledWith(
      options,
    );
  });

  it('parses paths from comma-separated string', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    setupSuccessfulFlow();

    await command.run([], {
      table: 'Article',
      paths: 'title, status, author',
      output: './patches',
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '📋 Using paths: title, status, author',
    );

    consoleSpy.mockRestore();
  });

  it('generates patches for all rows', async () => {
    setupSuccessfulFlow();

    await command.run([], {
      table: 'Article',
      paths: 'title',
      output: './patches',
    });

    expect(generatorServiceFake.generatePatches).toHaveBeenCalledTimes(2);
  });

  it('saves patches as separate files by default', async () => {
    setupSuccessfulFlow();

    await command.run([], {
      table: 'Article',
      paths: 'title',
      output: './patches',
    });

    expect(loaderServiceFake.savePatchesAsSeparateFiles).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
        }),
      ]),
      './patches',
    );
  });

  it('saves patches as merged file when merge option is provided', async () => {
    setupSuccessfulFlow();

    await command.run([], {
      table: 'Article',
      paths: 'title',
      output: './patches.json',
      merge: true,
    });

    expect(loaderServiceFake.savePatchesAsMergedFile).toHaveBeenCalledWith(
      expect.any(Array),
      './patches.json',
    );
  });

  it('skips rows with no patches', async () => {
    setupSuccessfulFlow();
    generatorServiceFake.generatePatches
      .mockReturnValueOnce([{ op: 'replace', path: 'title', value: 'Title' }])
      .mockReturnValueOnce([]);

    await command.run([], {
      table: 'Article',
      paths: 'title',
      output: './patches',
    });

    expect(loaderServiceFake.savePatchesAsSeparateFiles).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ rowId: 'row-1' })]),
      './patches',
    );

    const savedPatches =
      loaderServiceFake.savePatchesAsSeparateFiles.mock.calls[0][0];
    expect(savedPatches).toHaveLength(1);
  });

  it('logs when no patches are generated', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: mockRows.map((row) => ({ node: row })),
        pageInfo: { hasNextPage: false },
      },
    });
    generatorServiceFake.generatePatches.mockReturnValue([]);

    await command.run([], {
      table: 'Article',
      paths: 'title',
      output: './patches',
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '⚠️  No patches generated (all paths were empty)',
    );

    consoleSpy.mockRestore();
  });

  function setupSuccessfulFlow() {
    coreApiServiceFake.tryToLogin.mockResolvedValue(undefined);
    draftRevisionServiceFake.getDraftRevisionId.mockResolvedValue(
      'revision-123',
    );
    coreApiServiceFake.api.rows.mockResolvedValue({
      data: {
        edges: mockRows.map((row) => ({ node: row })),
        pageInfo: { hasNextPage: false },
      },
    });
    generatorServiceFake.generatePatches.mockReturnValue([
      { op: 'replace', path: 'title', value: 'Title' },
    ]);
    loaderServiceFake.savePatchesAsSeparateFiles.mockResolvedValue();
    loaderServiceFake.savePatchesAsMergedFile.mockResolvedValue();
  }
});
