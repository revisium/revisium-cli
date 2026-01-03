import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConnectionService } from '../connection.service';
import { UrlBuilderService, RevisiumUrlComplete } from '../url-builder.service';

describe('ConnectionService', () => {
  let service: ConnectionService;
  let urlBuilderServiceFake: {
    parseAndComplete: jest.Mock;
    formatAsRevisiumUrl: jest.Mock;
  };
  let configServiceFake: { get: jest.Mock };

  const mockUrl: RevisiumUrlComplete = {
    baseUrl: 'https://cloud.revisium.io',
    organization: 'test-org',
    project: 'test-project',
    branch: 'main',
    revision: 'draft',
    auth: { method: 'token', token: 'test-token' },
  };

  beforeEach(async () => {
    urlBuilderServiceFake = {
      parseAndComplete: jest.fn(),
      formatAsRevisiumUrl: jest.fn(),
    };

    configServiceFake = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionService,
        { provide: UrlBuilderService, useValue: urlBuilderServiceFake },
        { provide: ConfigService, useValue: configServiceFake },
      ],
    }).compile();

    service = module.get<ConnectionService>(ConnectionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connection property access before connect', () => {
    it('throws error when accessing connection before connect', () => {
      expect(() => service.connection).toThrow(
        'Connection not established. Call connect() first.',
      );
    });

    it('throws error when accessing api before connect', () => {
      expect(() => service.api).toThrow(
        'Connection not established. Call connect() first.',
      );
    });

    it('throws error when accessing revisionId before connect', () => {
      expect(() => service.revisionId).toThrow(
        'Connection not established. Call connect() first.',
      );
    });

    it('throws error when accessing draftRevisionId before connect', () => {
      expect(() => service.draftRevisionId).toThrow(
        'Connection not established. Call connect() first.',
      );
    });

    it('throws error when accessing headRevisionId before connect', () => {
      expect(() => service.headRevisionId).toThrow(
        'Connection not established. Call connect() first.',
      );
    });

    it('throws error when accessing bulkCreateSupported before connect', () => {
      expect(() => service.bulkCreateSupported).toThrow(
        'Connection not established. Call connect() first.',
      );
    });

    it('throws error when accessing bulkUpdateSupported before connect', () => {
      expect(() => service.bulkUpdateSupported).toThrow(
        'Connection not established. Call connect() first.',
      );
    });

    it('throws error when accessing bulkPatchSupported before connect', () => {
      expect(() => service.bulkPatchSupported).toThrow(
        'Connection not established. Call connect() first.',
      );
    });

    it('throws error when setting bulkCreateSupported before connect', () => {
      expect(() => {
        service.bulkCreateSupported = true;
      }).toThrow('Connection not established. Call connect() first.');
    });

    it('throws error when setting bulkUpdateSupported before connect', () => {
      expect(() => {
        service.bulkUpdateSupported = true;
      }).toThrow('Connection not established. Call connect() first.');
    });

    it('throws error when setting bulkPatchSupported before connect', () => {
      expect(() => {
        service.bulkPatchSupported = true;
      }).toThrow('Connection not established. Call connect() first.');
    });
  });

  describe('connect', () => {
    it('reads environment config from ConfigService', async () => {
      configServiceFake.get
        .mockReturnValueOnce('revisium://host/org/proj')
        .mockReturnValueOnce('test-token')
        .mockReturnValueOnce('api-key')
        .mockReturnValueOnce('username')
        .mockReturnValueOnce('password');

      urlBuilderServiceFake.parseAndComplete.mockRejectedValue(
        new Error('test error'),
      );

      await expect(service.connect()).rejects.toThrow();

      expect(configServiceFake.get).toHaveBeenCalledWith('REVISIUM_URL');
      expect(configServiceFake.get).toHaveBeenCalledWith('REVISIUM_TOKEN');
      expect(configServiceFake.get).toHaveBeenCalledWith('REVISIUM_API_KEY');
      expect(configServiceFake.get).toHaveBeenCalledWith('REVISIUM_USERNAME');
      expect(configServiceFake.get).toHaveBeenCalledWith('REVISIUM_PASSWORD');
    });

    it('passes url option to parseAndComplete', async () => {
      const testUrl = 'revisium://test.com/org/proj';

      urlBuilderServiceFake.parseAndComplete.mockRejectedValue(
        new Error('test error'),
      );

      await expect(service.connect({ url: testUrl })).rejects.toThrow();

      expect(urlBuilderServiceFake.parseAndComplete).toHaveBeenCalledWith(
        testUrl,
        'api',
        expect.any(Object),
      );
    });

    it('passes undefined url when not provided', async () => {
      urlBuilderServiceFake.parseAndComplete.mockRejectedValue(
        new Error('test error'),
      );

      await expect(service.connect()).rejects.toThrow();

      expect(urlBuilderServiceFake.parseAndComplete).toHaveBeenCalledWith(
        undefined,
        'api',
        expect.any(Object),
      );
    });

    it('passes env config to parseAndComplete', async () => {
      configServiceFake.get
        .mockReturnValueOnce('env-url')
        .mockReturnValueOnce('env-token')
        .mockReturnValueOnce('env-apikey')
        .mockReturnValueOnce('env-username')
        .mockReturnValueOnce('env-password');

      urlBuilderServiceFake.parseAndComplete.mockRejectedValue(
        new Error('test error'),
      );

      await expect(service.connect()).rejects.toThrow();

      expect(urlBuilderServiceFake.parseAndComplete).toHaveBeenCalledWith(
        undefined,
        'api',
        {
          url: 'env-url',
          token: 'env-token',
          apikey: 'env-apikey',
          username: 'env-username',
          password: 'env-password',
        },
      );
    });
  });

  describe('revision resolution', () => {
    it('uses draft revision when revision is draft', async () => {
      const url = { ...mockUrl, revision: 'draft' };
      setupSuccessfulConnection(url, {
        headId: 'head-123',
        draftId: 'draft-456',
      });

      await service.connect();

      expect(service.revisionId).toBe('draft-456');
    });

    it('uses head revision when revision is head', async () => {
      const url = { ...mockUrl, revision: 'head' };
      setupSuccessfulConnection(url, {
        headId: 'head-123',
        draftId: 'draft-456',
      });

      await service.connect();

      expect(service.revisionId).toBe('head-123');
    });

    it('uses specific revision ID when provided', async () => {
      const url = { ...mockUrl, revision: 'specific-rev-id' };
      setupSuccessfulConnection(url, {
        headId: 'head-123',
        draftId: 'draft-456',
      });

      await service.connect();

      expect(service.revisionId).toBe('specific-rev-id');
    });
  });

  describe('connection properties after connect', () => {
    it('provides access to headRevisionId', async () => {
      setupSuccessfulConnection(mockUrl, {
        headId: 'test-head-id',
        draftId: 'test-draft-id',
      });

      await service.connect();

      expect(service.headRevisionId).toBe('test-head-id');
    });

    it('provides access to draftRevisionId', async () => {
      setupSuccessfulConnection(mockUrl, {
        headId: 'test-head-id',
        draftId: 'test-draft-id',
      });

      await service.connect();

      expect(service.draftRevisionId).toBe('test-draft-id');
    });
  });

  describe('bulk operation flags', () => {
    it('allows setting and getting bulkCreateSupported', async () => {
      setupSuccessfulConnection(mockUrl, {
        headId: 'head-id',
        draftId: 'draft-id',
      });
      await service.connect();

      expect(service.bulkCreateSupported).toBeUndefined();

      service.bulkCreateSupported = true;
      expect(service.bulkCreateSupported).toBe(true);

      service.bulkCreateSupported = false;
      expect(service.bulkCreateSupported).toBe(false);
    });

    it('allows setting and getting bulkUpdateSupported', async () => {
      setupSuccessfulConnection(mockUrl, {
        headId: 'head-id',
        draftId: 'draft-id',
      });
      await service.connect();

      expect(service.bulkUpdateSupported).toBeUndefined();

      service.bulkUpdateSupported = true;
      expect(service.bulkUpdateSupported).toBe(true);
    });

    it('allows setting and getting bulkPatchSupported', async () => {
      setupSuccessfulConnection(mockUrl, {
        headId: 'head-id',
        draftId: 'draft-id',
      });
      await service.connect();

      expect(service.bulkPatchSupported).toBeUndefined();

      service.bulkPatchSupported = true;
      expect(service.bulkPatchSupported).toBe(true);
    });
  });

  function setupSuccessfulConnection(
    url: RevisiumUrlComplete,
    revisions: { headId: string; draftId: string },
  ) {
    urlBuilderServiceFake.parseAndComplete.mockResolvedValue(url);
    urlBuilderServiceFake.formatAsRevisiumUrl.mockReturnValue(
      `revisium://host/${url.organization}/${url.project}`,
    );

    const mockApiClient = createMockApiClient(revisions);

    const resolveRevisionId = (): string => {
      if (url.revision === 'head') {
        return revisions.headId;
      }
      if (url.revision === 'draft') {
        return revisions.draftId;
      }
      return url.revision;
    };

    jest.spyOn(service as any, 'establishConnection').mockResolvedValue({
      url,
      client: mockApiClient,
      revisionId: resolveRevisionId(),
      headRevisionId: revisions.headId,
      draftRevisionId: revisions.draftId,
    });
  }

  function createMockApiClient(revisions: { headId: string; draftId: string }) {
    return {
      api: {
        me: jest.fn().mockResolvedValue({ data: { username: 'test-user' } }),
        project: jest.fn().mockResolvedValue({ data: { id: 'project-id' } }),
        headRevision: jest
          .fn()
          .mockResolvedValue({ data: { id: revisions.headId } }),
        draftRevision: jest
          .fn()
          .mockResolvedValue({ data: { id: revisions.draftId } }),
      },
      authenticate: jest.fn().mockResolvedValue('test-user'),
      bulkCreateSupported: undefined as boolean | undefined,
      bulkUpdateSupported: undefined as boolean | undefined,
      bulkPatchSupported: undefined as boolean | undefined,
    };
  }
});
