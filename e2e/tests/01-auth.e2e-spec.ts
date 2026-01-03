import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCli, buildUrl } from '../utils/cli-runner';
import { createTestProject } from '../utils/test-project';
import { FIXTURES_PATH } from '../utils/constants';

describe('CLI Authentication', () => {
  let projectName: string;
  let tempDir: string;

  beforeAll(async () => {
    const project = await createTestProject();
    projectName = project.name;

    // Apply migrations to have some data
    const token = process.env.E2E_ADMIN_TOKEN!;
    await runCli([
      'migrate',
      'apply',
      '--url',
      buildUrl(projectName, { token }),
      '--file',
      path.join(FIXTURES_PATH, 'migrations.json'),
    ]);
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-auth-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('URL token authentication', () => {
    it('authenticates with token in URL query parameter', async () => {
      const token = process.env.E2E_ADMIN_TOKEN!;

      const result = await runCli([
        'schema',
        'save',
        '--url',
        buildUrl(projectName, { token }),
        '--folder',
        tempDir,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Authenticated as admin');
      expect(result.stdout).toContain('Successfully saved');
    });

    it('fails with invalid token', async () => {
      const result = await runCli([
        'schema',
        'save',
        '--url',
        buildUrl(projectName, { token: 'invalid-token' }),
        '--folder',
        tempDir,
      ]);

      expect(result.exitCode).toBe(1);
    });
  });

  describe('Environment variable authentication', () => {
    it('uses REVISIUM_TOKEN from environment', async () => {
      const token = process.env.E2E_ADMIN_TOKEN!;

      const result = await runCli(
        ['schema', 'save', '--url', buildUrl(projectName), '--folder', tempDir],
        {
          env: { REVISIUM_TOKEN: token },
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Authenticated as admin');
    });

    it('URL token takes precedence over env token', async () => {
      const token = process.env.E2E_ADMIN_TOKEN!;

      const result = await runCli(
        [
          'schema',
          'save',
          '--url',
          buildUrl(projectName, { token }),
          '--folder',
          tempDir,
        ],
        {
          env: { REVISIUM_TOKEN: 'wrong-token' },
        },
      );

      // Should succeed because URL token is used
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Username/password authentication', () => {
    it('authenticates with credentials from environment', async () => {
      const result = await runCli(
        ['schema', 'save', '--url', buildUrl(projectName), '--folder', tempDir],
        {
          env: {
            REVISIUM_USERNAME: 'admin',
            REVISIUM_PASSWORD: 'admin',
          },
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Authenticated as admin');
    });

    it('fails with wrong password', async () => {
      const result = await runCli(
        ['schema', 'save', '--url', buildUrl(projectName), '--folder', tempDir],
        {
          env: {
            REVISIUM_USERNAME: 'admin',
            REVISIUM_PASSWORD: 'wrong-password',
          },
        },
      );

      expect(result.exitCode).toBe(1);
    });

    it('token takes precedence over username/password', async () => {
      const token = process.env.E2E_ADMIN_TOKEN!;

      const result = await runCli(
        [
          'schema',
          'save',
          '--url',
          buildUrl(projectName, { token }),
          '--folder',
          tempDir,
        ],
        {
          env: {
            REVISIUM_USERNAME: 'wrong-user',
            REVISIUM_PASSWORD: 'wrong-password',
          },
        },
      );

      // Should succeed because token is used
      expect(result.exitCode).toBe(0);
    });
  });
});
