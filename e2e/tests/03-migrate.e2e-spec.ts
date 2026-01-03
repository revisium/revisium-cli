import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCli, buildUrl } from '../utils/cli-runner';
import { createTestProject } from '../utils/test-project';
import { api } from '../utils/api-client';
import { FIXTURES_PATH } from '../utils/constants';

describe('Migrate Commands', () => {
  let tempDir: string;
  let token: string;

  beforeAll(() => {
    token = process.env.E2E_ADMIN_TOKEN!;
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-migrate-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('migrate apply', () => {
    it('applies migrations to empty project', async () => {
      const project = await createTestProject();

      const result = await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Successfully applied');
      expect(result.stdout).toContain('14 migrations');

      // Verify tables were created
      const tables = await api.getTables(project.rootBranch.draftRevisionId);
      expect(tables.length).toBe(14);

      const tableIds = tables.map((t) => t.id);
      expect(tableIds).toContain('abilities');
      expect(tableIds).toContain('quests');
      expect(tableIds).toContain('npcs');
    });

    it('validates migration file before applying', async () => {
      const project = await createTestProject();
      const invalidFile = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(invalidFile, JSON.stringify([{ invalid: 'data' }]));

      const result = await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        invalidFile,
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toContain('validation');
    });

    it('applies migrations with --commit flag', async () => {
      const project = await createTestProject();
      const beforeHeadId = project.rootBranch.headRevisionId;

      const result = await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
        '--commit',
      ]);

      expect(result.exitCode).toBe(0);

      // Verify revision was created
      const updatedProject = await api.getProject('admin', project.name);
      expect(updatedProject.rootBranch.headRevisionId).not.toBe(beforeHeadId);
    });

    it('skips already applied migrations', async () => {
      const project = await createTestProject();

      // Apply once
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      // Apply again
      const result = await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      expect(result.exitCode).toBe(0);
      // Should skip or handle gracefully
    });
  });

  describe('migrate save', () => {
    it('saves migrations from project', async () => {
      const project = await createTestProject();

      // First apply migrations
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
        '--commit',
      ]);

      // Then save them
      const migrationsFile = path.join(tempDir, 'saved-migrations.json');
      const result = await runCli([
        'migrate',
        'save',
        '--url',
        buildUrl(project.name, { token, revision: 'head' }),
        '--file',
        migrationsFile,
      ]);

      expect(result.exitCode).toBe(0);

      // Verify saved file
      const migrations = JSON.parse(fs.readFileSync(migrationsFile, 'utf-8'));
      expect(Array.isArray(migrations)).toBe(true);
      expect(migrations.length).toBe(14);
    });

    it('saves empty migrations from empty project', async () => {
      const project = await createTestProject();
      const migrationsFile = path.join(tempDir, 'empty-migrations.json');

      const result = await runCli([
        'migrate',
        'save',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        migrationsFile,
      ]);

      expect(result.exitCode).toBe(0);

      const migrations = JSON.parse(fs.readFileSync(migrationsFile, 'utf-8'));
      expect(migrations).toEqual([]);
    });
  });
});
