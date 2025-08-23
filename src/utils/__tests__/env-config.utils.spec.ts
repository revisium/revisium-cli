import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import {
  getEnvFilePath,
  shouldIgnoreEnvFile,
} from 'src/utils/env-config.utils';

jest.mock('fs');
jest.mock('path');

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockStatSync = statSync as jest.MockedFunction<typeof statSync>;
const mockResolve = resolve as jest.MockedFunction<typeof resolve>;

// Mock stat result objects
const createMockStats = (isDirectory: boolean) =>
  ({
    isDirectory: () => isDirectory,
  }) as ReturnType<typeof statSync>;

describe('env-config functions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockResolve.mockImplementation((path: string) => `/resolved/${path}`);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getEnvFilePath', () => {
    it('returns path from REVISIUM_ENV_FILE when file exists and is not directory', () => {
      process.env.REVISIUM_ENV_FILE = 'custom.env';
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue(createMockStats(false));

      const result = getEnvFilePath();

      expect(result).toBe('/resolved/custom.env');
      expect(mockResolve).toHaveBeenCalledWith('custom.env');
    });

    it('returns default .env path when REVISIUM_ENV_FILE not set and .env exists', () => {
      delete process.env.REVISIUM_ENV_FILE;
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue(createMockStats(false));

      const result = getEnvFilePath();

      expect(result).toBe('/resolved/.env');
      expect(mockResolve).toHaveBeenCalledWith('.env');
    });

    it('returns undefined when REVISIUM_ENV_FILE points to directory', () => {
      process.env.REVISIUM_ENV_FILE = 'some-dir';
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue(createMockStats(true));

      const result = getEnvFilePath();

      expect(result).toBeUndefined();
    });

    it('returns undefined when no valid env file found', () => {
      delete process.env.REVISIUM_ENV_FILE;
      mockExistsSync.mockReturnValue(false);

      const result = getEnvFilePath();

      expect(result).toBeUndefined();
    });

    it('returns undefined when REVISIUM_ENV_FILE has stat error', () => {
      process.env.REVISIUM_ENV_FILE = 'error.env';
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = getEnvFilePath();

      expect(result).toBeUndefined();
    });
  });

  describe('shouldIgnoreEnvFile', () => {
    it('returns true when no env file path found', () => {
      delete process.env.REVISIUM_ENV_FILE;
      mockExistsSync.mockReturnValue(false);

      const result = shouldIgnoreEnvFile();

      expect(result).toBe(true);
    });

    it('returns false when env file exists and is regular file', () => {
      process.env.REVISIUM_ENV_FILE = 'valid.env';
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue(createMockStats(false));

      const result = shouldIgnoreEnvFile();

      expect(result).toBe(false);
    });
  });
});
