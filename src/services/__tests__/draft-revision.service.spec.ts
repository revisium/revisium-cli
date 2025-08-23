import { ConfigService } from '@nestjs/config';
import {
  DraftRevisionService,
  DEFAULT_BRANCH,
} from '../draft-revision.service';

const mockDraftRevision = jest.fn();

const mockCoreApiService = {
  api: {
    draftRevision: mockDraftRevision,
  },
};

describe('DraftRevisionService', () => {
  it('resolves organization from options', async () => {
    const service = createService({});
    mockDraftRevision.mockResolvedValue({ data: { id: 'revision-123' } });

    const options = {
      organization: 'test-org',
      project: 'test-project',
    };

    const result = await service.getDraftRevisionId(options);

    expect(mockDraftRevision).toHaveBeenCalledWith(
      'test-org',
      'test-project',
      DEFAULT_BRANCH,
    );
    expect(result).toBe('revision-123');
  });

  it('resolves project from options', async () => {
    const service = createService({ REVISIUM_ORGANIZATION: 'env-org' });
    mockDraftRevision.mockResolvedValue({ data: { id: 'revision-456' } });

    const options = {
      project: 'test-project',
      branch: 'test-branch',
    };

    const result = await service.getDraftRevisionId(options);

    expect(mockDraftRevision).toHaveBeenCalledWith(
      'env-org',
      'test-project',
      'test-branch',
    );
    expect(result).toBe('revision-456');
  });

  it('resolves branch from options', async () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'env-org',
      REVISIUM_PROJECT: 'env-project',
    });
    mockDraftRevision.mockResolvedValue({ data: { id: 'revision-789' } });

    const options = { branch: 'feature-branch' };

    const result = await service.getDraftRevisionId(options);

    expect(mockDraftRevision).toHaveBeenCalledWith(
      'env-org',
      'env-project',
      'feature-branch',
    );
    expect(result).toBe('revision-789');
  });

  it('uses environment variables when options not provided', async () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'env-org',
      REVISIUM_PROJECT: 'env-project',
      REVISIUM_BRANCH: 'env-branch',
    });
    mockDraftRevision.mockResolvedValue({ data: { id: 'env-revision' } });

    const result = await service.getDraftRevisionId();

    expect(mockDraftRevision).toHaveBeenCalledWith(
      'env-org',
      'env-project',
      'env-branch',
    );
    expect(result).toBe('env-revision');
  });

  it('uses default branch when not specified', async () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'test-org',
      REVISIUM_PROJECT: 'test-project',
    });
    mockDraftRevision.mockResolvedValue({
      data: { id: 'default-branch-revision' },
    });

    const result = await service.getDraftRevisionId();

    expect(mockDraftRevision).toHaveBeenCalledWith(
      'test-org',
      'test-project',
      DEFAULT_BRANCH,
    );
    expect(result).toBe('default-branch-revision');
  });

  it('prefers options over environment variables', async () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'env-org',
      REVISIUM_PROJECT: 'env-project',
      REVISIUM_BRANCH: 'env-branch',
    });
    mockDraftRevision.mockResolvedValue({ data: { id: 'priority-revision' } });

    const options = {
      organization: 'option-org',
      project: 'option-project',
      branch: 'option-branch',
    };

    const result = await service.getDraftRevisionId(options);

    expect(mockDraftRevision).toHaveBeenCalledWith(
      'option-org',
      'option-project',
      'option-branch',
    );
    expect(result).toBe('priority-revision');
  });

  it('throws error when organization is missing', async () => {
    const service = createService({ REVISIUM_PROJECT: 'test-project' });

    await expect(service.getDraftRevisionId()).rejects.toThrow(
      'No organization provided. Use environment variable REVISIUM_ORGANIZATION or --organization option.',
    );
  });

  it('throws error when project is missing', async () => {
    const service = createService({ REVISIUM_ORGANIZATION: 'test-org' });

    await expect(service.getDraftRevisionId()).rejects.toThrow(
      'No project provided. Use environment variable REVISIUM_PROJECT or --project option.',
    );
  });

  it('throws error when organization is empty string', async () => {
    const service = createService({
      REVISIUM_ORGANIZATION: '',
      REVISIUM_PROJECT: 'test-project',
    });

    await expect(service.getDraftRevisionId()).rejects.toThrow(
      'No organization provided. Use environment variable REVISIUM_ORGANIZATION or --organization option.',
    );
  });

  it('throws error when project is empty string', async () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'test-org',
      REVISIUM_PROJECT: '',
    });

    await expect(service.getDraftRevisionId()).rejects.toThrow(
      'No project provided. Use environment variable REVISIUM_PROJECT or --project option.',
    );
  });

  it('handles mixed parameter sources correctly', async () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'env-org',
      REVISIUM_BRANCH: 'env-branch',
    });
    mockDraftRevision.mockResolvedValue({ data: { id: 'mixed-revision' } });

    const options = { project: 'option-project' };

    const result = await service.getDraftRevisionId(options);

    expect(mockDraftRevision).toHaveBeenCalledWith(
      'env-org',
      'option-project',
      'env-branch',
    );
    expect(result).toBe('mixed-revision');
  });

  it('handles API error responses', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const service = createService({
      REVISIUM_ORGANIZATION: 'test-org',
      REVISIUM_PROJECT: 'test-project',
    });
    mockDraftRevision.mockResolvedValue({ error: 'Project not found' });

    await expect(service.getDraftRevisionId()).rejects.toThrow(
      'Project not found',
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to get draft revision for test-org/test-project/master: Project not found',
    );
    consoleErrorSpy.mockRestore();
  });

  it('handles API network errors', async () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'test-org',
      REVISIUM_PROJECT: 'test-project',
    });
    const networkError = new Error('Network timeout');
    mockDraftRevision.mockRejectedValue(networkError);

    await expect(service.getDraftRevisionId()).rejects.toThrow(
      'Network timeout',
    );
  });

  it('handles different revision ID formats', async () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'test-org',
      REVISIUM_PROJECT: 'test-project',
    });

    const testCases = [
      { input: { id: 'uuid-123-456' }, expected: 'uuid-123-456' },
      { input: { id: '12345' }, expected: '12345' },
      { input: { id: 'rev_abcdef' }, expected: 'rev_abcdef' },
    ];

    for (const testCase of testCases) {
      mockDraftRevision.mockResolvedValue({ data: testCase.input });

      const result = await service.getDraftRevisionId();

      expect(result).toBe(testCase.expected);
    }
  });

  it('validates that default branch is master', () => {
    expect(DEFAULT_BRANCH).toBe('master');
  });

  it('handles empty options object', async () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'test-org',
      REVISIUM_PROJECT: 'test-project',
    });
    mockDraftRevision.mockResolvedValue({
      data: { id: 'empty-options-revision' },
    });

    const result = await service.getDraftRevisionId({});

    expect(mockDraftRevision).toHaveBeenCalledWith(
      'test-org',
      'test-project',
      DEFAULT_BRANCH,
    );
    expect(result).toBe('empty-options-revision');
  });

  const createService = (config: Record<string, string>) => {
    const configService = new ConfigService(config);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return new DraftRevisionService(configService, mockCoreApiService as any);
  };

  beforeEach(() => {
    mockDraftRevision.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});
