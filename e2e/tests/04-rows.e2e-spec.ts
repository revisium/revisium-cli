import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCli, buildUrl } from '../utils/cli-runner';
import { createTestProject } from '../utils/test-project';
import { api } from '../utils/api-client';
import { FIXTURES_PATH } from '../utils/constants';

describe('Rows Commands', () => {
  let tempDir: string;
  let token: string;

  beforeAll(() => {
    token = process.env.E2E_ADMIN_TOKEN!;
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-rows-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('rows save', () => {
    it('saves rows from project to folder', async () => {
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

      // Upload rows
      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
      ]);

      // Save rows
      const result = await runCli([
        'rows',
        'save',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        tempDir,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Successfully processed');

      // Verify table folders exist (structure: folder/tableId/rowId.json)
      const tableFolders = fs.readdirSync(tempDir);
      expect(tableFolders.length).toBeGreaterThan(0);

      // Check quests folder contains row files
      const questsFolder = path.join(tempDir, 'quests');
      if (fs.existsSync(questsFolder)) {
        const questFiles = fs.readdirSync(questsFolder);
        expect(questFiles.length).toBeGreaterThan(0);
        expect(questFiles.every((f) => f.endsWith('.json'))).toBe(true);
      }
    });

    it('saves empty project with no rows', async () => {
      const project = await createTestProject();

      // Apply migrations but don't upload rows
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      const result = await runCli([
        'rows',
        'save',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        tempDir,
      ]);

      expect(result.exitCode).toBe(0);

      // Table folders should exist but be empty (no row files)
      const tableFolders = fs.readdirSync(tempDir);
      tableFolders.forEach((folder) => {
        const folderPath = path.join(tempDir, folder);
        const stat = fs.statSync(folderPath);
        if (stat.isDirectory()) {
          const files = fs.readdirSync(folderPath);
          expect(files.length).toBe(0);
        }
      });
    });

    it('filters tables with --tables option', async () => {
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
        'rows',
        'save',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        tempDir,
        '--tables',
        'quests,npcs',
      ]);

      expect(result.exitCode).toBe(0);

      // Structure: folder/tableId/ (folders, not files)
      const tableFolders = fs.readdirSync(tempDir);
      expect(tableFolders).toContain('quests');
      expect(tableFolders).toContain('npcs');
      expect(tableFolders.length).toBe(2);
    });
  });

  describe('rows upload', () => {
    it('uploads rows from folder to project', async () => {
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

      // Upload rows
      const result = await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Success rate');

      // Get fresh project data after upload
      const updatedProject = await api.getProject('admin', project.name);

      // Verify rows were created
      const tables = await api.getTables(
        updatedProject.rootBranch.draftRevisionId,
      );
      const questsTable = tables.find((t) => t.id === 'quests');
      expect(questsTable).toBeDefined();

      const rows = await api.getRows(
        updatedProject.rootBranch.draftRevisionId,
        'quests',
      );
      expect(rows.length).toBeGreaterThan(0);
    });

    it('uploads with --commit flag', async () => {
      const project = await createTestProject();
      const beforeHeadId = project.rootBranch.headRevisionId;

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

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

    it('filters tables with --tables option', async () => {
      const project = await createTestProject();

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      // Use 'stats' table which has no foreign key dependencies
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

      // Other tables should be empty
      const questsRows = await api.getRows(
        updatedProject.rootBranch.draftRevisionId,
        'quests',
      );
      expect(questsRows.length).toBe(0);
    });

    it('handles missing row files gracefully', async () => {
      const project = await createTestProject();
      const emptyFolder = path.join(tempDir, 'empty-rows');
      fs.mkdirSync(emptyFolder);

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      const result = await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        emptyFolder,
      ]);

      // Should succeed with no rows to upload
      expect(result.exitCode).toBe(0);
    });

    it('handles invalid JSON file gracefully', async () => {
      const project = await createTestProject();
      const invalidRowsFolder = path.join(tempDir, 'invalid-rows');
      const questsSubfolder = path.join(invalidRowsFolder, 'quests');
      fs.mkdirSync(questsSubfolder, { recursive: true });

      // Create invalid JSON file in proper structure: folder/tableId/rowId.json
      fs.writeFileSync(
        path.join(questsSubfolder, 'row1.json'),
        'not valid json',
      );

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      const result = await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        invalidRowsFolder,
      ]);

      // Invalid JSON is counted as error but doesn't stop upload
      // (otherErrors is incremented)
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Other errors: 1');
    });

    it('updates existing rows when data changes (update path)', async () => {
      const project = await createTestProject();

      // Apply migrations
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      // First upload
      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
      ]);

      // Create modified rows folder with changed data
      const modifiedRowsFolder = path.join(tempDir, 'modified-rows');
      const statsSubfolder = path.join(modifiedRowsFolder, 'stats');
      fs.mkdirSync(statsSubfolder, { recursive: true });

      // Create modified row with different value (stats schema only has name and description)
      fs.writeFileSync(
        path.join(statsSubfolder, 'strength.json'),
        JSON.stringify({
          id: 'strength',
          data: {
            name: 'Strength MODIFIED',
            description: 'Physical power - UPDATED',
          },
        }),
      );

      // Second upload should update
      const result = await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        modifiedRowsFolder,
        '--tables',
        'stats',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Updated (changed): 1');

      // Verify the row was updated
      const updatedProject = await api.getProject('admin', project.name);
      const rows = await api.getRows(
        updatedProject.rootBranch.draftRevisionId,
        'stats',
      );
      const strengthRow = rows.find((r) => r.id === 'strength');
      expect(strengthRow).toBeDefined();
      expect(strengthRow!.data.name).toBe('Strength MODIFIED');
    });

    it('skips identical rows on re-upload (skip path)', async () => {
      const project = await createTestProject();

      // Apply migrations
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      // First upload
      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
        '--tables',
        'stats',
      ]);

      // Second upload with same data should skip
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
      // All 20 stats should be skipped as identical
      expect(result.stdout).toContain('Skipped (identical): 20');
      expect(result.stdout).toContain('Uploaded (new): 0');
      expect(result.stdout).toContain('Updated (changed): 0');
    });
  });
});
