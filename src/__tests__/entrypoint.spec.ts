import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const execAsync = promisify(exec);

const ENTRYPOINT_PATH = join(__dirname, '../../revisium-entrypoint.sh');

type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

async function runEntrypoint(
  env: Record<string, string> = {},
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(`bash ${ENTRYPOINT_PATH}`, {
      env: { ...process.env, ...env, PATH: process.env.PATH },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const execError = error as { stdout: string; stderr: string; code: number };
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || '',
      exitCode: execError.code || 1,
    };
  }
}

function createTempFile(content: string = '[]'): string {
  const tempDir = join(tmpdir(), `entrypoint-test-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  const filePath = join(tempDir, 'migrations.json');
  writeFileSync(filePath, content);
  return filePath;
}

function createTempDataDir(): string {
  const tempDir = join(tmpdir(), `entrypoint-data-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  const tableDir = join(tempDir, 'test-table');
  mkdirSync(tableDir);
  writeFileSync(join(tableDir, 'row1.json'), '{"id": "1"}');
  return tempDir;
}

describe('revisium-entrypoint.sh', () => {
  let tempFiles: string[] = [];

  afterEach(() => {
    for (const file of tempFiles) {
      try {
        rmSync(file, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    tempFiles = [];
  });

  describe('require_envs validation', () => {
    it('fails when REVISIUM_URL is not set and migrations file exists', async () => {
      const migrationsFile = createTempFile('[]');
      tempFiles.push(join(migrationsFile, '..'));

      const result = await runEntrypoint({
        MIGRATIONS_FILE: migrationsFile,
        DRY_RUN: 'false',
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('REVISIUM_URL is required');
    });

    it('fails when REVISIUM_URL is not set and data dir exists', async () => {
      const dataDir = createTempDataDir();
      tempFiles.push(dataDir);

      const result = await runEntrypoint({
        MIGRATIONS_FILE: '/nonexistent/path.json',
        DATA_DIR: dataDir,
        DRY_RUN: 'false',
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('REVISIUM_URL is required');
    });

    it('shows correct URL format in error message', async () => {
      const migrationsFile = createTempFile('[]');
      tempFiles.push(join(migrationsFile, '..'));

      const result = await runEntrypoint({
        MIGRATIONS_FILE: migrationsFile,
      });

      expect(result.stderr).toContain('revisium://');
      expect(result.stderr).toContain('host/org/project/branch:draft');
      expect(result.stderr).toContain(
        'https://github.com/revisium/revisium-cli/blob/master/docs/url-format.md',
      );
    });
  });

  describe('URL authentication formats', () => {
    it('accepts URL with token in query parameter', async () => {
      const migrationsFile = createTempFile('[]');
      tempFiles.push(join(migrationsFile, '..'));

      const result = await runEntrypoint({
        DRY_RUN: 'true',
        REVISIUM_URL:
          'revisium://cloud.example.com/org/proj/master?token=test123',
        MIGRATIONS_FILE: migrationsFile,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[DRY_RUN]');
      expect(result.stdout).toContain('--url');
      expect(result.stdout).toContain('token=test123');
    });

    it('accepts URL with credentials (user:pass@host)', async () => {
      const migrationsFile = createTempFile('[]');
      tempFiles.push(join(migrationsFile, '..'));

      const result = await runEntrypoint({
        DRY_RUN: 'true',
        REVISIUM_URL:
          'revisium://admin:secret@cloud.example.com/org/proj/master',
        MIGRATIONS_FILE: migrationsFile,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[DRY_RUN]');
      expect(result.stdout).toContain('admin:secret@cloud.example.com');
    });

    it('accepts URL with apikey in query parameter', async () => {
      const migrationsFile = createTempFile('[]');
      tempFiles.push(join(migrationsFile, '..'));

      const result = await runEntrypoint({
        DRY_RUN: 'true',
        REVISIUM_URL:
          'revisium://cloud.example.com/org/proj/master?apikey=ak_test123',
        MIGRATIONS_FILE: migrationsFile,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('apikey=ak_test123');
    });

    it('accepts URL without auth when REVISIUM_TOKEN env is set', async () => {
      const migrationsFile = createTempFile('[]');
      tempFiles.push(join(migrationsFile, '..'));

      const result = await runEntrypoint({
        DRY_RUN: 'true',
        REVISIUM_URL: 'revisium://cloud.example.com/org/proj/master',
        REVISIUM_TOKEN: 'env_token_123',
        MIGRATIONS_FILE: migrationsFile,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[DRY_RUN]');
    });

    it('accepts URL without auth when REVISIUM_USERNAME/PASSWORD env are set', async () => {
      const migrationsFile = createTempFile('[]');
      tempFiles.push(join(migrationsFile, '..'));

      const result = await runEntrypoint({
        DRY_RUN: 'true',
        REVISIUM_URL: 'revisium://cloud.example.com/org/proj/master',
        REVISIUM_USERNAME: 'admin',
        REVISIUM_PASSWORD: 'secret',
        MIGRATIONS_FILE: migrationsFile,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[DRY_RUN]');
    });

    it('accepts URL with draft revision specified', async () => {
      const migrationsFile = createTempFile('[]');
      tempFiles.push(join(migrationsFile, '..'));

      const result = await runEntrypoint({
        DRY_RUN: 'true',
        REVISIUM_URL:
          'revisium://cloud.example.com/org/proj/master:draft?token=test',
        MIGRATIONS_FILE: migrationsFile,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('master:draft');
    });

    it('accepts localhost URL with port', async () => {
      const migrationsFile = createTempFile('[]');
      tempFiles.push(join(migrationsFile, '..'));

      const result = await runEntrypoint({
        DRY_RUN: 'true',
        REVISIUM_URL: 'revisium://localhost:8080/org/proj/master?token=test',
        MIGRATIONS_FILE: migrationsFile,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('localhost:8080');
    });
  });

  describe('DRY_RUN mode', () => {
    it('logs DRY_RUN enabled when set to true', async () => {
      const result = await runEntrypoint({
        DRY_RUN: 'true',
        MIGRATIONS_FILE: '/nonexistent/path.json',
        DATA_DIR: '/nonexistent/dir',
      });

      expect(result.stdout).toContain('DRY_RUN enabled');
    });

    it('shows command with --url parameter in DRY_RUN mode', async () => {
      const migrationsFile = createTempFile('[]');
      tempFiles.push(join(migrationsFile, '..'));

      const result = await runEntrypoint({
        DRY_RUN: 'true',
        REVISIUM_URL: 'revisium://localhost:8080/org/proj/master?token=test',
        MIGRATIONS_FILE: migrationsFile,
        DATA_DIR: '/nonexistent/dir',
      });

      expect(result.stdout).toContain('[DRY_RUN]');
      expect(result.stdout).toContain('--url');
      expect(result.stdout).toContain(
        'revisium://localhost:8080/org/proj/master',
      );
    });
  });

  describe('skip conditions', () => {
    it('skips migrations when file does not exist', async () => {
      const result = await runEntrypoint({
        DRY_RUN: 'true',
        MIGRATIONS_FILE: '/nonexistent/migrations.json',
        DATA_DIR: '/nonexistent/dir',
      });

      expect(result.stdout).toContain(
        'No migrations file found, skip migrations',
      );
    });

    it('skips rows upload when data dir is empty or missing', async () => {
      const result = await runEntrypoint({
        DRY_RUN: 'true',
        MIGRATIONS_FILE: '/nonexistent/migrations.json',
        DATA_DIR: '/nonexistent/dir',
      });

      expect(result.stdout).toContain(
        'Data dir empty or missing, skip rows upload',
      );
    });
  });

  describe('commit flags', () => {
    it('includes --commit flag when REVISIUM_MIGRATE_COMMIT is true', async () => {
      const migrationsFile = createTempFile('[]');
      tempFiles.push(join(migrationsFile, '..'));

      const result = await runEntrypoint({
        DRY_RUN: 'true',
        REVISIUM_URL: 'revisium://localhost:8080/org/proj/master?token=test',
        REVISIUM_MIGRATE_COMMIT: 'true',
        MIGRATIONS_FILE: migrationsFile,
        DATA_DIR: '/nonexistent/dir',
      });

      expect(result.stdout).toContain('[DRY_RUN]');
      expect(result.stdout).toContain('migrate apply');
      expect(result.stdout).toContain('--commit');
    });

    it('includes --commit flag when REVISIUM_UPLOAD_COMMIT is true', async () => {
      const dataDir = createTempDataDir();
      tempFiles.push(dataDir);

      const result = await runEntrypoint({
        DRY_RUN: 'true',
        REVISIUM_URL: 'revisium://localhost:8080/org/proj/master?token=test',
        REVISIUM_UPLOAD_COMMIT: 'true',
        MIGRATIONS_FILE: '/nonexistent/migrations.json',
        DATA_DIR: dataDir,
      });

      expect(result.stdout).toContain('[DRY_RUN]');
      expect(result.stdout).toContain('rows upload');
      expect(result.stdout).toContain('--commit');
    });

    it('accepts various truthy values for commit flags', async () => {
      const migrationsFile = createTempFile('[]');
      tempFiles.push(join(migrationsFile, '..'));

      for (const value of ['true', 'TRUE', '1', 'yes', 'YES', 'y', 'Y']) {
        const result = await runEntrypoint({
          DRY_RUN: 'true',
          REVISIUM_URL: 'revisium://localhost:8080/org/proj/master?token=test',
          REVISIUM_MIGRATE_COMMIT: value,
          MIGRATIONS_FILE: migrationsFile,
        });

        expect(result.stdout).toContain('[DRY_RUN]');
        expect(result.stdout).toContain('migrate apply');
        expect(result.stdout).toContain('--commit');
      }
    });
  });

  describe('logging', () => {
    it('logs CLI version', async () => {
      const result = await runEntrypoint({
        DRY_RUN: 'true',
        MIGRATIONS_FILE: '/nonexistent/path.json',
        DATA_DIR: '/nonexistent/dir',
      });

      expect(result.stdout).toContain('Revisium CLI:');
    });

    it('logs migrations file path', async () => {
      const result = await runEntrypoint({
        DRY_RUN: 'true',
        MIGRATIONS_FILE: '/custom/path/migrations.json',
        DATA_DIR: '/nonexistent/dir',
      });

      expect(result.stdout).toContain('/custom/path/migrations.json');
    });

    it('logs data dir path', async () => {
      const result = await runEntrypoint({
        DRY_RUN: 'true',
        MIGRATIONS_FILE: '/nonexistent/path.json',
        DATA_DIR: '/custom/data/dir',
      });

      expect(result.stdout).toContain('/custom/data/dir');
    });

    it('logs Done at the end', async () => {
      const result = await runEntrypoint({
        DRY_RUN: 'true',
        MIGRATIONS_FILE: '/nonexistent/path.json',
        DATA_DIR: '/nonexistent/dir',
      });

      expect(result.stdout).toContain('Done.');
    });
  });
});
