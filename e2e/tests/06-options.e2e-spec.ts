import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCli, buildUrl } from '../utils/cli-runner';
import { createTestProject } from '../utils/test-project';
import { api } from '../utils/api-client';
import { FIXTURES_PATH } from '../utils/constants';

describe('CLI Options', () => {
  let tempDir: string;
  let token: string;

  beforeAll(() => {
    token = process.env.E2E_ADMIN_TOKEN!;
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-options-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('--commit option', () => {
    it('commits changes after migrate apply', async () => {
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

      const updatedProject = await api.getProject('admin', project.name);
      expect(updatedProject.rootBranch.headRevisionId).not.toBe(beforeHeadId);
    });

    it('commits changes after rows upload', async () => {
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

      const projectAfterMigrate = await api.getProject('admin', project.name);
      const beforeHeadId = projectAfterMigrate.rootBranch.headRevisionId;

      // Then upload rows with commit
      const result = await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
        '--commit',
      ]);

      expect(result.exitCode).toBe(0);

      const updatedProject = await api.getProject('admin', project.name);
      expect(updatedProject.rootBranch.headRevisionId).not.toBe(beforeHeadId);
    });

    it('does not commit without --commit flag', async () => {
      const project = await createTestProject();
      const beforeHeadId = project.rootBranch.headRevisionId;

      const result = await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      expect(result.exitCode).toBe(0);

      const updatedProject = await api.getProject('admin', project.name);
      expect(updatedProject.rootBranch.headRevisionId).toBe(beforeHeadId);
    });
  });

  describe('--tables option', () => {
    it('filters tables for rows upload', async () => {
      const project = await createTestProject();

      // Apply migrations first
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      // Upload only 'stats' table which has no foreign key dependencies
      const result = await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
        '--tables',
        'stats',
      ]);

      expect(result.exitCode).toBe(0);

      // Get fresh project to have current draftRevisionId
      const updatedProject = await api.getProject('admin', project.name);

      // Verify only stats rows were uploaded (20 stat types)
      const statsRows = await api.getRows(
        updatedProject.rootBranch.draftRevisionId,
        'stats',
      );
      expect(statsRows.length).toBe(20);
    });
  });

  describe('--revision option', () => {
    it('reads from head revision when specified', async () => {
      const project = await createTestProject();

      // Apply and commit
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
        '--commit',
      ]);

      // Save from head
      const result = await runCli([
        'schema',
        'save',
        '--url',
        buildUrl(project.name, { token, revision: 'head' }),
        '--folder',
        tempDir,
      ]);

      expect(result.exitCode).toBe(0);

      const files = fs.readdirSync(tempDir);
      expect(files.length).toBe(14);
    });

    it('reads from draft revision by default', async () => {
      const project = await createTestProject();

      // Apply without commit
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      // Save from draft (default)
      const result = await runCli([
        'schema',
        'save',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        tempDir,
      ]);

      expect(result.exitCode).toBe(0);

      const files = fs.readdirSync(tempDir);
      expect(files.length).toBe(14);
    });
  });

  describe('URL format', () => {
    it('supports revisium:// protocol URL', async () => {
      const project = await createTestProject();

      const result = await runCli([
        'schema',
        'save',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        tempDir,
      ]);

      expect(result.exitCode).toBe(0);
    });

    it('supports URL with revision parameter', async () => {
      const project = await createTestProject();

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
        '--commit',
      ]);

      const result = await runCli([
        'schema',
        'save',
        '--url',
        buildUrl(project.name, { token, revision: 'head' }),
        '--folder',
        tempDir,
      ]);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('error handling', () => {
    it('shows helpful error for invalid URL', async () => {
      const result = await runCli([
        'schema',
        'save',
        '--url',
        'invalid-protocol://test',
        '--folder',
        tempDir,
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toMatch(/invalid|port/i);
    });

    it('shows helpful error for non-existent project', async () => {
      const result = await runCli([
        'schema',
        'save',
        '--url',
        buildUrl('non-existent-project-xyz', { token }),
        '--folder',
        tempDir,
      ]);

      expect(result.exitCode).toBe(1);
    });

    it('shows helpful error for missing required options', async () => {
      const result = await runCli([
        'schema',
        'save',
        '--url',
        'http://example.com',
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toMatch(/folder|required/i);
    });
  });
});
