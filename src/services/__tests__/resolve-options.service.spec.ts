import { ConfigService } from '@nestjs/config';
import { ResolveOptionsService } from 'src/services/resolve-options.service';
import { DEFAULT_BRANCH } from '../draft-revision.service';

describe('ResolveOptionsService', () => {
  it('resolves organization from options', () => {
    const service = createService({});

    const options = {
      organization: 'test-org',
      project: 'test-project',
    };

    const result = service.resolve(options);

    expect(result).toStrictEqual({
      organization: 'test-org',
      project: 'test-project',
      branch: DEFAULT_BRANCH,
    });
  });

  it('resolves project from options', () => {
    const service = createService({ REVISIUM_ORGANIZATION: 'env-org' });

    const options = {
      project: 'test-project',
      branch: 'test-branch',
    };

    const result = service.resolve(options);

    expect(result).toStrictEqual({
      organization: 'env-org',
      project: 'test-project',
      branch: 'test-branch',
    });
  });

  it('resolves branch from options', () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'env-org',
      REVISIUM_PROJECT: 'env-project',
    });

    const options = { branch: 'feature-branch' };

    const result = service.resolve(options);

    expect(result).toStrictEqual({
      organization: 'env-org',
      project: 'env-project',
      branch: 'feature-branch',
    });
  });

  it('uses environment variables when options not provided', () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'env-org',
      REVISIUM_PROJECT: 'env-project',
      REVISIUM_BRANCH: 'env-branch',
    });

    const result = service.resolve();

    expect(result).toStrictEqual({
      organization: 'env-org',
      project: 'env-project',
      branch: 'env-branch',
    });
  });

  it('uses default branch when not specified', () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'test-org',
      REVISIUM_PROJECT: 'test-project',
    });

    const result = service.resolve();

    expect(result).toStrictEqual({
      organization: 'test-org',
      project: 'test-project',
      branch: DEFAULT_BRANCH,
    });
  });

  it('prefers options over environment variables', () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'env-org',
      REVISIUM_PROJECT: 'env-project',
      REVISIUM_BRANCH: 'env-branch',
    });

    const options = {
      organization: 'option-org',
      project: 'option-project',
      branch: 'option-branch',
    };

    const result = service.resolve(options);

    expect(result).toStrictEqual({
      organization: 'option-org',
      project: 'option-project',
      branch: 'option-branch',
    });
  });

  it('throws error when organization is missing', () => {
    const service = createService({ REVISIUM_PROJECT: 'test-project' });

    expect(() => service.resolve()).toThrow(
      'No organization provided. Use environment variable REVISIUM_ORGANIZATION or --organization option.',
    );
  });

  it('throws error when project is missing', () => {
    const service = createService({ REVISIUM_ORGANIZATION: 'test-org' });

    expect(() => service.resolve()).toThrow(
      'No project provided. Use environment variable REVISIUM_PROJECT or --project option.',
    );
  });

  it('throws error when organization is empty string', () => {
    const service = createService({
      REVISIUM_ORGANIZATION: '',
      REVISIUM_PROJECT: 'test-project',
    });

    expect(() => service.resolve()).toThrow(
      'No organization provided. Use environment variable REVISIUM_ORGANIZATION or --organization option.',
    );
  });

  it('throws error when project is empty string', () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'test-org',
      REVISIUM_PROJECT: '',
    });

    expect(() => service.resolve()).toThrow(
      'No project provided. Use environment variable REVISIUM_PROJECT or --project option.',
    );
  });

  it('handles mixed parameter sources correctly', () => {
    const service = createService({
      REVISIUM_ORGANIZATION: 'env-org',
      REVISIUM_BRANCH: 'env-branch',
    });
    const options = { project: 'option-project' };

    const result = service.resolve(options);

    expect(result).toStrictEqual({
      organization: 'env-org',
      project: 'option-project',
      branch: 'env-branch',
    });
  });

  it('validates that default branch is master', () => {
    expect(DEFAULT_BRANCH).toBe('master');
  });

  const createService = (config: Record<string, string>) => {
    const configService = new ConfigService(config);
    return new ResolveOptionsService(configService);
  };

  afterEach(() => {
    jest.clearAllMocks();
  });
});
