/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { CommitRevisionService } from '../commit-revision.service';
import { CoreApiService } from '../core-api.service';
import { ResolveOptionsService } from '../resolve-options.service';

describe('CommitRevisionService', () => {
  describe('commitChanges', () => {
    it('creates revision with correct parameters', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      resolveOptionsServiceFake.resolve.mockReturnValue({
        organization: 'test-org',
        project: 'test-project',
        branch: 'test-branch',
      });
      coreApiServiceFake.api.createRevision.mockResolvedValue({
        data: { id: 'revision-123' },
      });

      const result = await service.commitChanges(
        {
          organization: 'test-org',
          project: 'test-project',
          branch: 'test-branch',
        },
        'Applied',
        3,
      );

      expect(resolveOptionsServiceFake.resolve).toHaveBeenCalledWith({
        organization: 'test-org',
        project: 'test-project',
        branch: 'test-branch',
      });
      expect(coreApiServiceFake.api.createRevision).toHaveBeenCalledWith(
        'test-org',
        'test-project',
        'test-branch',
        {
          comment: 'Applied 3 items via revisium-cli',
        },
      );
      expect(result).toEqual({ revisionId: 'revision-123' });
      expect(consoleSpy).toHaveBeenCalledWith('💾 Creating revision...');
      expect(consoleSpy).toHaveBeenCalledWith(
        '✅ Created revision: revision-123',
      );

      consoleSpy.mockRestore();
    });

    it('generates correct comment for single item', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      resolveOptionsServiceFake.resolve.mockReturnValue({
        organization: 'test-org',
        project: 'test-project',
        branch: 'test-branch',
      });
      coreApiServiceFake.api.createRevision.mockResolvedValue({
        data: { id: 'revision-456' },
      });

      await service.commitChanges(
        {
          organization: 'test-org',
          project: 'test-project',
          branch: 'test-branch',
        },
        'Uploaded',
        1,
      );

      expect(coreApiServiceFake.api.createRevision).toHaveBeenCalledWith(
        'test-org',
        'test-project',
        'test-branch',
        {
          comment: 'Uploaded 1 item via revisium-cli',
        },
      );

      consoleSpy.mockRestore();
    });

    it('handles API error gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      resolveOptionsServiceFake.resolve.mockReturnValue({
        organization: 'test-org',
        project: 'test-project',
        branch: 'test-branch',
      });

      const apiError = new Error('Network timeout');
      coreApiServiceFake.api.createRevision.mockRejectedValue(apiError);

      await expect(
        service.commitChanges(
          {
            organization: 'test-org',
            project: 'test-project',
            branch: 'test-branch',
          },
          'Applied',
          2,
        ),
      ).rejects.toThrow('Network timeout');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Failed to create revision: Network timeout',
      );

      consoleErrorSpy.mockRestore();
    });

    it('handles no data in response', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      resolveOptionsServiceFake.resolve.mockReturnValue({
        organization: 'test-org',
        project: 'test-project',
        branch: 'test-branch',
      });
      coreApiServiceFake.api.createRevision.mockResolvedValue({
        data: null,
      });

      await expect(
        service.commitChanges(
          {
            organization: 'test-org',
            project: 'test-project',
            branch: 'test-branch',
          },
          'Applied',
          2,
        ),
      ).rejects.toThrow('Failed to create revision');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Failed to create revision: No data returned',
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('handleCommitFlow', () => {
    it('creates revision when commit is true and changes exist', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      resolveOptionsServiceFake.resolve.mockReturnValue({
        organization: 'test-org',
        project: 'test-project',
        branch: 'test-branch',
      });
      coreApiServiceFake.api.createRevision.mockResolvedValue({
        data: { id: 'revision-789' },
      });

      await service.handleCommitFlow(
        {
          organization: 'test-org',
          project: 'test-project',
          branch: 'test-branch',
          commit: true,
        },
        'Applied',
        5,
      );

      expect(coreApiServiceFake.api.createRevision).toHaveBeenCalledWith(
        'test-org',
        'test-project',
        'test-branch',
        {
          comment: 'Applied 5 items via revisium-cli',
        },
      );

      consoleSpy.mockRestore();
    });

    it('shows warning when commit is false and changes exist', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.handleCommitFlow(
        {
          organization: 'test-org',
          project: 'test-project',
          branch: 'test-branch',
          commit: false,
        },
        'Applied',
        3,
      );

      expect(coreApiServiceFake.api.createRevision).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        '⚠️  Changes applied to draft. Use --commit to create a revision.',
      );

      consoleSpy.mockRestore();
    });

    it('does not create revision when no changes', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.handleCommitFlow(
        {
          organization: 'test-org',
          project: 'test-project',
          branch: 'test-branch',
          commit: true,
        },
        'Applied',
        0,
      );

      expect(coreApiServiceFake.api.createRevision).not.toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalledWith('💾 Creating revision...');

      consoleSpy.mockRestore();
    });
  });

  let service: CommitRevisionService;
  let coreApiServiceFake: any;
  let resolveOptionsServiceFake: any;

  beforeEach(async () => {
    coreApiServiceFake = {
      api: {
        createRevision: jest.fn(),
      },
    };

    resolveOptionsServiceFake = {
      resolve: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommitRevisionService,
        { provide: CoreApiService, useValue: coreApiServiceFake },
        { provide: ResolveOptionsService, useValue: resolveOptionsServiceFake },
      ],
    }).compile();

    service = module.get<CommitRevisionService>(CommitRevisionService);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
