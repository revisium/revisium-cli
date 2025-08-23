import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { CoreApiService } from '../core-api.service';
import { BaseOptions } from 'src/commands/base.command';

const mockApiLogin = jest.fn();

jest.mock('src/__generated__/api', () => ({
  Api: class {
    baseUrl: string;
    constructor({ baseUrl }: { baseUrl: string }) {
      this.baseUrl = baseUrl;
    }
    api = {
      login: mockApiLogin,
    };
    mergeRequestParams = jest.fn();
  },
}));

describe('CoreApiService', () => {
  it('initializes with base URL from config', () => {
    const service = createService({ REVISIUM_API_URL: 'http://test-api.com' });

    expect(service.baseUrl).toBe('http://test-api.com');
  });

  it('initializes with default base URL when not provided', () => {
    const service = createService({});

    expect(service.baseUrl).toBe('https://cloud.revisium.io/');
  });

  it('uses default base URL when none provided', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const service = createService({});

    await service.tryToLogin();

    expect(service.baseUrl).toBe('https://cloud.revisium.io/');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Skipping login: username or password is missing.',
    );
    consoleSpy.mockRestore();
  });

  it('sets base URL from options when provided', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const service = createService({});
    const options: BaseOptions = { url: 'http://options-api.com' };

    await service.tryToLogin(options);

    expect(service.baseUrl).toBe('http://options-api.com');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Skipping login: username or password is missing.',
    );
    consoleSpy.mockRestore();
  });

  it('prefers options URL over config URL', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const service = createService({
      REVISIUM_API_URL: 'http://config-api.com',
    });
    const options: BaseOptions = { url: 'http://options-api.com' };

    await service.tryToLogin(options);

    expect(service.baseUrl).toBe('http://options-api.com');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Skipping login: username or password is missing.',
    );
    consoleSpy.mockRestore();
  });

  it('logs message when credentials are missing', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const service = createService({ REVISIUM_API_URL: 'http://test-api.com' });

    await service.tryToLogin();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Skipping login: username or password is missing.',
    );
    consoleSpy.mockRestore();
  });

  it('attempts login with environment credentials', async () => {
    const service = createService({
      REVISIUM_API_URL: 'http://test-api.com',
      REVISIUM_USERNAME: 'env-user',
      REVISIUM_PASSWORD: 'env-pass',
    });
    mockApiLogin.mockResolvedValue({ data: { accessToken: 'test-token' } });

    await service.tryToLogin();

    expect(mockApiLogin).toHaveBeenCalledWith({
      emailOrUsername: 'env-user',
      password: 'env-pass',
    });
    expect(service.token).toBe('test-token');
  });

  it('attempts login with options credentials', async () => {
    const service = createService({ REVISIUM_API_URL: 'http://test-api.com' });
    const options: BaseOptions = {
      username: 'option-user',
      password: 'option-pass',
    };
    mockApiLogin.mockResolvedValue({ data: { accessToken: 'option-token' } });

    await service.tryToLogin(options);

    expect(mockApiLogin).toHaveBeenCalledWith({
      emailOrUsername: 'option-user',
      password: 'option-pass',
    });
    expect(service.token).toBe('option-token');
  });

  it('prefers options credentials over environment credentials', async () => {
    const service = createService({
      REVISIUM_API_URL: 'http://test-api.com',
      REVISIUM_USERNAME: 'env-user',
      REVISIUM_PASSWORD: 'env-pass',
    });
    const options: BaseOptions = {
      username: 'option-user',
      password: 'option-pass',
    };
    mockApiLogin.mockResolvedValue({ data: { accessToken: 'priority-token' } });

    await service.tryToLogin(options);

    expect(mockApiLogin).toHaveBeenCalledWith({
      emailOrUsername: 'option-user',
      password: 'option-pass',
    });
    expect(service.token).toBe('priority-token');
  });

  it('throws InternalServerErrorException on login API error', async () => {
    const service = createService({
      REVISIUM_API_URL: 'http://test-api.com',
      REVISIUM_USERNAME: 'user',
      REVISIUM_PASSWORD: 'pass',
    });
    mockApiLogin.mockResolvedValue({ error: 'Invalid credentials' });

    await expect(service.tryToLogin()).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('handles mixed credential sources correctly', async () => {
    const service = createService({
      REVISIUM_API_URL: 'http://test-api.com',
      REVISIUM_USERNAME: 'env-user',
    });
    const options: BaseOptions = { password: 'option-pass' };
    mockApiLogin.mockResolvedValue({ data: { accessToken: 'mixed-token' } });

    await service.tryToLogin(options);

    expect(mockApiLogin).toHaveBeenCalledWith({
      emailOrUsername: 'env-user',
      password: 'option-pass',
    });
  });

  it('does not attempt login with only username', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const service = createService({
      REVISIUM_API_URL: 'http://test-api.com',
      REVISIUM_USERNAME: 'user-only',
    });

    await service.tryToLogin();

    expect(mockApiLogin).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Skipping login: username or password is missing.',
    );
    consoleSpy.mockRestore();
  });

  it('does not attempt login with only password', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const service = createService({
      REVISIUM_API_URL: 'http://test-api.com',
      REVISIUM_PASSWORD: 'pass-only',
    });

    await service.tryToLogin();

    expect(mockApiLogin).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Skipping login: username or password is missing.',
    );
    consoleSpy.mockRestore();
  });

  it('handles login API network errors', async () => {
    const service = createService({
      REVISIUM_API_URL: 'http://test-api.com',
      REVISIUM_USERNAME: 'user',
      REVISIUM_PASSWORD: 'pass',
    });
    const networkError = new Error('Network timeout');
    mockApiLogin.mockRejectedValue(networkError);

    await expect(service.tryToLogin()).rejects.toThrow('Network timeout');
  });

  it('correctly sets token on successful login', async () => {
    const service = createService({
      REVISIUM_API_URL: 'http://test-api.com',
      REVISIUM_USERNAME: 'user',
      REVISIUM_PASSWORD: 'pass',
    });
    mockApiLogin.mockResolvedValue({
      data: { accessToken: 'unique-token-123' },
    });

    await service.tryToLogin();

    expect(service.token).toBe('unique-token-123');
  });

  it('handles empty string credentials as missing', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const service = createService({
      REVISIUM_API_URL: 'http://test-api.com',
      REVISIUM_USERNAME: '',
      REVISIUM_PASSWORD: '',
    });

    await service.tryToLogin();

    expect(mockApiLogin).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Skipping login: username or password is missing.',
    );
    consoleSpy.mockRestore();
  });

  const createService = (config: Record<string, string>) => {
    const configService = new ConfigService(config);
    return new CoreApiService(configService);
  };

  beforeEach(() => {
    mockApiLogin.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});
