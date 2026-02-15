import { ConnectionFactoryService } from '../connection-factory.service';
import { UrlBuilderService, RevisiumUrlComplete } from '../../url';
import { LoggerService } from '../../common';
import { RevisiumApiClient } from '../api-client';

jest.mock('../api-client');

describe('ConnectionFactoryService', () => {
  let service: ConnectionFactoryService;
  let urlBuilderFake: { formatAsRevisiumUrl: jest.Mock };
  let loggerFake: {
    connecting: jest.Mock;
    connected: jest.Mock;
    authenticated: jest.Mock;
  };

  const mockDraftScope = {
    revisionId: 'draft-456',
    isDraft: true,
  };

  const mockHeadScope = {
    revisionId: 'head-123',
    isDraft: false,
  };

  const mockExplicitScope = {
    revisionId: 'specific-rev-id',
    isDraft: false,
  };

  const mockBranchScope = {
    draft: jest.fn().mockReturnValue(mockDraftScope),
    head: jest.fn().mockReturnValue(mockHeadScope),
    revision: jest.fn().mockResolvedValue(mockExplicitScope),
    headRevisionId: 'head-123',
    draftRevisionId: 'draft-456',
  };

  const baseUrl: RevisiumUrlComplete = {
    baseUrl: 'https://cloud.revisium.io',
    organization: 'test-org',
    project: 'test-project',
    branch: 'main',
    revision: 'draft',
    auth: { method: 'token', token: 'test-token' },
  };

  beforeEach(() => {
    urlBuilderFake = {
      formatAsRevisiumUrl: jest.fn().mockReturnValue('revisium://...'),
    };

    loggerFake = {
      connecting: jest.fn(),
      connected: jest.fn(),
      authenticated: jest.fn(),
    };

    const MockApiClient = RevisiumApiClient as jest.MockedClass<
      typeof RevisiumApiClient
    >;
    MockApiClient.mockImplementation(
      () =>
        ({
          client: {
            branch: jest.fn().mockResolvedValue(mockBranchScope),
          },
          authenticate: jest.fn().mockResolvedValue('test-user'),
        }) as unknown as RevisiumApiClient,
    );

    service = new ConnectionFactoryService(
      urlBuilderFake as unknown as UrlBuilderService,
      loggerFake as unknown as LoggerService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('revision resolution', () => {
    it('uses draft scope when revision is draft', async () => {
      const url = { ...baseUrl, revision: 'draft' };

      const result = await service.createConnection(url);

      expect(mockBranchScope.draft).toHaveBeenCalled();
      expect(mockBranchScope.head).not.toHaveBeenCalled();
      expect(mockBranchScope.revision).not.toHaveBeenCalled();
      expect(result.revisionScope).toBe(mockDraftScope);
    });

    it('uses head scope when revision is head', async () => {
      const url = { ...baseUrl, revision: 'head' };

      const result = await service.createConnection(url);

      expect(mockBranchScope.head).toHaveBeenCalled();
      expect(mockBranchScope.draft).not.toHaveBeenCalled();
      expect(mockBranchScope.revision).not.toHaveBeenCalled();
      expect(result.revisionScope).toBe(mockHeadScope);
    });

    it('uses explicit revision scope for specific revision ID', async () => {
      const url = { ...baseUrl, revision: 'specific-rev-id' };

      const result = await service.createConnection(url);

      expect(mockBranchScope.revision).toHaveBeenCalledWith('specific-rev-id');
      expect(mockBranchScope.draft).not.toHaveBeenCalled();
      expect(mockBranchScope.head).not.toHaveBeenCalled();
      expect(result.revisionScope).toBe(mockExplicitScope);
    });
  });
});
