import { Test, TestingModule } from '@nestjs/testing';
import { SyncApiService } from '../sync-api.service';
import {
  UrlBuilderService,
  RevisiumUrlComplete,
  AuthCredentials,
} from '../url-builder.service';

describe('SyncApiService', () => {
  let service: SyncApiService;
  let urlBuilderMock: jest.Mocked<UrlBuilderService>;

  const createMockUrl = (
    overrides: Partial<RevisiumUrlComplete> = {},
  ): RevisiumUrlComplete => ({
    baseUrl: 'https://api.example.com',
    auth: { method: 'token', token: 'test-token' } as AuthCredentials,
    organization: 'test-org',
    project: 'test-project',
    branch: 'master',
    revision: 'draft',
    ...overrides,
  });

  beforeEach(async () => {
    urlBuilderMock = {
      formatAsRevisiumUrl: jest.fn().mockReturnValue('revisium://test'),
      parse: jest.fn(),
      parseAndComplete: jest.fn(),
      buildBaseUrl: jest.fn(),
    } as unknown as jest.Mocked<UrlBuilderService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncApiService,
        { provide: UrlBuilderService, useValue: urlBuilderMock },
      ],
    }).compile();

    service = module.get<SyncApiService>(SyncApiService);
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('source getter', () => {
    it('throws error when source not connected', () => {
      expect(() => service.source).toThrow('Source connection not established');
    });
  });

  describe('target getter', () => {
    it('throws error when target not connected', () => {
      expect(() => service.target).toThrow('Target connection not established');
    });
  });

  describe('connectTarget', () => {
    it('throws error when revision is not draft', async () => {
      const url = createMockUrl({ revision: 'head' });

      await expect(service.connectTarget(url)).rejects.toThrow(
        'Target revision must be "draft", got "head". Sync writes to draft revision only.',
      );
    });

    it('throws error for custom revision id', async () => {
      const url = createMockUrl({ revision: 'abc123' });

      await expect(service.connectTarget(url)).rejects.toThrow(
        'Target revision must be "draft", got "abc123". Sync writes to draft revision only.',
      );
    });
  });
});
