import { existsSync, statSync } from 'fs';
import { resolve } from 'path';

/**
 * Get the environment file path from REVISIUM_ENV_FILE or default to .env
 */
export function getEnvFilePath(): string | undefined {
  const envFileFromEnv = process.env.REVISIUM_ENV_FILE;

  if (envFileFromEnv) {
    const resolvedPath = resolve(envFileFromEnv);
    if (existsSync(resolvedPath)) {
      try {
        if (!statSync(resolvedPath).isDirectory()) {
          return resolvedPath;
        }
      } catch {
        // Ignore stat errors and continue
      }
    }
  }

  // Default to .env if it exists and is not a directory
  const defaultPath = resolve('.env');
  if (existsSync(defaultPath)) {
    try {
      if (!statSync(defaultPath).isDirectory()) {
        return defaultPath;
      }
    } catch {
      // Ignore stat errors and continue
    }
  }

  return undefined;
}

/**
 * Check if we should ignore the env file (if it's a directory or doesn't exist)
 */
export function shouldIgnoreEnvFile(): boolean {
  const envFilePath = getEnvFilePath();

  if (!envFilePath) {
    return true; // No env file found or specified
  }

  const resolvedPath = resolve(envFilePath);

  if (!existsSync(resolvedPath)) {
    return true; // File doesn't exist
  }

  try {
    const stats = statSync(resolvedPath);
    if (stats.isDirectory()) {
      console.warn(`⚠️  Specified env file is a directory: ${envFilePath}`);
      return true; // It's a directory, not a file
    }
  } catch {
    console.warn(`⚠️  Error checking env file: ${envFilePath}`);
    return true; // Error reading file stats
  }

  return false; // File exists and is a regular file
}
