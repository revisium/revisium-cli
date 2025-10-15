import { CoreApiService } from 'src/services/core-api.service';
import { ResolveOptionsService } from 'src/services/resolve-options.service';
import { DraftRevisionService } from '../draft-revision.service';

const mockDraftRevision = jest.fn();
const mockResolve = jest.fn();

const mockCoreApiService = {
  api: {
    draftRevision: mockDraftRevision,
  },
};

const mockResolveService = {
  resolve: mockResolve,
};

describe('DraftRevisionService', () => {
  it('handles API error responses', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const service = createService();
    mockDraftRevision.mockResolvedValue({
      error: new Error('Project not found'),
    });
    mockResolve.mockResolvedValue({
      REVISIUM_ORGANIZATION: 'test-org',
      REVISIUM_PROJECT: 'test-project',
    });

    await expect(service.getDraftRevisionId()).rejects.toThrow(
      'Project not found',
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to get draft revision: Project not found',
    );
    consoleErrorSpy.mockRestore();
  });

  it('handles API network errors', async () => {
    const service = createService();
    const networkError = new Error('Network timeout');
    mockDraftRevision.mockRejectedValue(networkError);
    mockResolve.mockResolvedValue({
      REVISIUM_ORGANIZATION: 'test-org',
      REVISIUM_PROJECT: 'test-project',
    });

    await expect(service.getDraftRevisionId()).rejects.toThrow(
      'Network timeout',
    );
  });

  it('handles different revision ID formats', async () => {
    const service = createService();
    mockResolve.mockResolvedValue({
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

  const createService = () => {
    return new DraftRevisionService(
      mockCoreApiService as unknown as CoreApiService,
      mockResolveService as unknown as ResolveOptionsService,
    );
  };

  beforeEach(() => {
    mockDraftRevision.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});
