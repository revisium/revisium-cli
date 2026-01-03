import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCli, buildUrl } from '../utils/cli-runner';
import { createTestProject } from '../utils/test-project';
import { api } from '../utils/api-client';
import { FIXTURES_PATH } from '../utils/constants';

const PATCHES_PATH = 'e2e/fixtures/patches';
const PATCHES_INVALID_PATH = 'e2e/fixtures/patches-invalid';
const PATCHES_MERGED_PATH = 'e2e/fixtures/patches-merged.json';

describe('Patches Commands', () => {
  let tempDir: string;
  let token: string;

  beforeAll(() => {
    token = process.env.E2E_ADMIN_TOKEN!;
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-patches-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('patches save', () => {
    it('saves patches from table to folder', async () => {
      const project = await createTestProject();

      // Setup: apply migrations and upload rows
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
      ]);

      // Save patches for 'name' field
      const result = await runCli([
        'patches',
        'save',
        '--url',
        buildUrl(project.name, { token }),
        '--table',
        'quests',
        '--paths',
        'name,description',
        '--output',
        tempDir,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Saved successfully');

      // Verify patch files were created
      const files = fs.readdirSync(tempDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files.every((f) => f.endsWith('.json'))).toBe(true);

      // Verify patch file structure
      const firstFile = JSON.parse(
        fs.readFileSync(path.join(tempDir, files[0]), 'utf-8'),
      );
      expect(firstFile.version).toBe('1.0');
      expect(firstFile.table).toBe('quests');
      expect(firstFile.patches).toBeDefined();
      expect(Array.isArray(firstFile.patches)).toBe(true);
    });

    it('saves patches as merged file with --merge flag', async () => {
      const project = await createTestProject();

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
      ]);

      const outputFile = path.join(tempDir, 'patches.json');

      const result = await runCli([
        'patches',
        'save',
        '--url',
        buildUrl(project.name, { token }),
        '--table',
        'quests',
        '--paths',
        'name',
        '--output',
        outputFile,
        '--merge',
      ]);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(outputFile)).toBe(true);

      const merged = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
      // Merged format: { version, table, createdAt, rows: [...] }
      expect(merged.version).toBe('1.0');
      expect(merged.table).toBe('quests');
      expect(Array.isArray(merged.rows)).toBe(true);
      expect(merged.rows.length).toBeGreaterThan(0);
    });

    it('handles empty paths gracefully', async () => {
      const project = await createTestProject();

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      // Save patches for non-existent field (no data)
      const result = await runCli([
        'patches',
        'save',
        '--url',
        buildUrl(project.name, { token }),
        '--table',
        'quests',
        '--paths',
        'nonexistent_field',
        '--output',
        tempDir,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No patches generated');
    });
  });

  describe('patches validate', () => {
    it('validates patch files against schema', async () => {
      const project = await createTestProject();

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
      ]);

      const result = await runCli([
        'patches',
        'validate',
        '--url',
        buildUrl(project.name, { token }),
        '--input',
        PATCHES_PATH,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('All patches are valid');
    });

    it('reports invalid patches', async () => {
      const project = await createTestProject();

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      const result = await runCli([
        'patches',
        'validate',
        '--url',
        buildUrl(project.name, { token }),
        '--input',
        PATCHES_INVALID_PATH,
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('Invalid');
    });

    it('validates merged patch file', async () => {
      const project = await createTestProject();

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
      ]);

      const result = await runCli([
        'patches',
        'validate',
        '--url',
        buildUrl(project.name, { token }),
        '--input',
        PATCHES_MERGED_PATH,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Valid');
    });
  });

  describe('patches preview', () => {
    it('shows diff between patches and current data', async () => {
      const project = await createTestProject();

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
      ]);

      const result = await runCli([
        'patches',
        'preview',
        '--url',
        buildUrl(project.name, { token }),
        '--input',
        PATCHES_PATH,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Summary');
      expect(result.stdout).toContain('Changes');
    });

    it('shows no changes when patches match current data', async () => {
      const project = await createTestProject();

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
      ]);

      // First save current values as patches
      const patchesDir = path.join(tempDir, 'patches');
      fs.mkdirSync(patchesDir);

      await runCli([
        'patches',
        'save',
        '--url',
        buildUrl(project.name, { token }),
        '--table',
        'quests',
        '--paths',
        'name',
        '--output',
        patchesDir,
      ]);

      // Then preview - should show no changes since patches match current data
      const result = await runCli([
        'patches',
        'preview',
        '--url',
        buildUrl(project.name, { token }),
        '--input',
        patchesDir,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No changes detected');
    });
  });

  describe('patches apply', () => {
    it('applies patches to rows', async () => {
      const project = await createTestProject();

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
      ]);

      const result = await runCli([
        'patches',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--input',
        PATCHES_PATH,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Applied');
      expect(result.stdout).toContain('All patches applied successfully');

      // Verify data was updated
      const updatedProject = await api.getProject('admin', project.name);
      const rows = await api.getRows(
        updatedProject.rootBranch.draftRevisionId,
        'quests',
      );
      const updatedRow = rows.find((r) => r.id === 'okhota_raider');
      expect(updatedRow).toBeDefined();
      expect(updatedRow!.data.name).toContain('Updated');
    });

    it('applies patches with --commit flag', async () => {
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

      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
        '--commit',
      ]);

      const projectBeforePatch = await api.getProject('admin', project.name);
      const beforeHeadId = projectBeforePatch.rootBranch.headRevisionId;

      const result = await runCli([
        'patches',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--input',
        PATCHES_PATH,
        '--commit',
      ]);

      expect(result.exitCode).toBe(0);

      const updatedProject = await api.getProject('admin', project.name);
      expect(updatedProject.rootBranch.headRevisionId).not.toBe(beforeHeadId);
    });

    it('skips patches when data already matches', async () => {
      const project = await createTestProject();

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
      ]);

      // Apply patches first time
      await runCli([
        'patches',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--input',
        PATCHES_PATH,
      ]);

      // Apply patches second time - should skip
      const result = await runCli([
        'patches',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--input',
        PATCHES_PATH,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No changes detected');
    });

    it('applies merged patch file', async () => {
      const project = await createTestProject();

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
      ]);

      const result = await runCli([
        'patches',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--input',
        PATCHES_MERGED_PATH,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Applied');
    });

    it('handles batch size option', async () => {
      const project = await createTestProject();

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
      ]);

      const result = await runCli([
        'patches',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--input',
        PATCHES_PATH,
        '--batch-size',
        '1',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Applied');
    });
  });

  describe('error handling', () => {
    it('fails when required --table option is missing for save', async () => {
      const project = await createTestProject();

      const result = await runCli([
        'patches',
        'save',
        '--url',
        buildUrl(project.name, { token }),
        '--paths',
        'name',
        '--output',
        tempDir,
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toMatch(/table|required/i);
    });

    it('fails when required --input option is missing for validate', async () => {
      const project = await createTestProject();

      const result = await runCli([
        'patches',
        'validate',
        '--url',
        buildUrl(project.name, { token }),
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toMatch(/input|required/i);
    });

    it('fails with invalid batch-size', async () => {
      const project = await createTestProject();

      const result = await runCli([
        'patches',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--input',
        PATCHES_PATH,
        '--batch-size',
        '-1',
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toMatch(/batch.*positive/i);
    });
  });
});
