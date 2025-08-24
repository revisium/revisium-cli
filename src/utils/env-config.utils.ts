import { existsSync, statSync } from 'fs';
import { resolve } from 'path';

/**
 * Check if a path exists and is a regular file (not a directory)
 */
function isValidFile(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }

  try {
    return !statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get the environment file path from REVISIUM_ENV_FILE or default to .env
 */
export function getEnvFilePath(): string | undefined {
  const envFileFromEnv = process.env.REVISIUM_ENV_FILE;

  if (envFileFromEnv) {
    const resolvedPath = resolve(envFileFromEnv);
    if (isValidFile(resolvedPath)) {
      return resolvedPath;
    }
  }

  // Default to .env if it exists and is not a directory
  const defaultPath = resolve('.env');
  if (isValidFile(defaultPath)) {
    return defaultPath;
  }

  return undefined;
}

/**
 * Check if we should ignore the env file (if it's a directory or doesn't exist)
 */
export function shouldIgnoreEnvFile(): boolean {
  return getEnvFilePath() === undefined;
}
