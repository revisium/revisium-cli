import { Test, TestingModule } from '@nestjs/testing';
import { CommitRevisionService } from '../commit-revision.service';
import { ConnectionService } from '../connection.service';

describe('CommitRevisionService', () => {
  let service: CommitRevisionService;
  let connectionServiceFake: {
    connection: {
      url: {
        organization: string;
        project: string;
        branch: string;
      };
      client: {
        api: {
          createRevision: jest.Mock;
        };
      };
    };
  };

  beforeEach(async () => {
    connectionServiceFake = {
      connection: {
        url: {
          organization: 'test-org',
          project: 'test-project',
          branch: 'test-branch',
        },
        client: {
          api: {
            createRevision: jest.fn(),
          },
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommitRevisionService,
        { provide: ConnectionService, useValue: connectionServiceFake },
      ],
    }).compile();

    service = module.get<CommitRevisionService>(CommitRevisionService);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('commitChanges', () => {
    it('creates revision with correct parameters', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      connectionServiceFake.connection.client.api.createRevision.mockResolvedValue(
        {
          data: { id: 'revision-123' },
        },
      );

      const result = await service.commitChanges('Applied', 3);

      expect(
        connectionServiceFake.connection.client.api.createRevision,
      ).toHaveBeenCalledWith('test-org', 'test-project', 'test-branch', {
        comment: 'Applied 3 items via revisium-cli',
      });
      expect(result).toEqual({ revisionId: 'revision-123' });
      expect(consoleSpy).toHaveBeenCalledWith('💾 Creating revision...');
      expect(consoleSpy).toHaveBeenCalledWith(
        '✅ Created revision: revision-123',
      );

      consoleSpy.mockRestore();
    });

    it('generates correct comment for single item', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      connectionServiceFake.connection.client.api.createRevision.mockResolvedValue(
        {
          data: { id: 'revision-456' },
        },
      );

      await service.commitChanges('Uploaded', 1);

      expect(
        connectionServiceFake.connection.client.api.createRevision,
      ).toHaveBeenCalledWith('test-org', 'test-project', 'test-branch', {
        comment: 'Uploaded 1 item via revisium-cli',
      });

      consoleSpy.mockRestore();
    });

    it('handles API error gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const apiError = new Error('Network timeout');
      connectionServiceFake.connection.client.api.createRevision.mockRejectedValue(
        apiError,
      );

      await expect(service.commitChanges('Applied', 2)).rejects.toThrow(
        'Network timeout',
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Failed to create revision: Network timeout',
      );

      consoleErrorSpy.mockRestore();
    });

    it('handles no data in response', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      connectionServiceFake.connection.client.api.createRevision.mockResolvedValue(
        {
          data: null,
        },
      );

      await expect(service.commitChanges('Applied', 2)).rejects.toThrow(
        'Failed to create revision',
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Failed to create revision: No data returned',
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('handleCommitFlow', () => {
    it('creates revision when commit is true and changes exist', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      connectionServiceFake.connection.client.api.createRevision.mockResolvedValue(
        {
          data: { id: 'revision-789' },
        },
      );

      await service.handleCommitFlow(true, 'Applied', 5);

      expect(
        connectionServiceFake.connection.client.api.createRevision,
      ).toHaveBeenCalledWith('test-org', 'test-project', 'test-branch', {
        comment: 'Applied 5 items via revisium-cli',
      });

      consoleSpy.mockRestore();
    });

    it('shows warning when commit is false and changes exist', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.handleCommitFlow(false, 'Applied', 3);

      expect(
        connectionServiceFake.connection.client.api.createRevision,
      ).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        '⚠️  Changes applied to draft. Use --commit to create a revision.',
      );

      consoleSpy.mockRestore();
    });

    it('does not create revision when no changes', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.handleCommitFlow(true, 'Applied', 0);

      expect(
        connectionServiceFake.connection.client.api.createRevision,
      ).not.toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalledWith('💾 Creating revision...');

      consoleSpy.mockRestore();
    });
  });
});
