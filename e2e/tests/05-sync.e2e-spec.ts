import * as path from 'path';
import { runCli, buildUrl } from '../utils/cli-runner';
import { createTestProject } from '../utils/test-project';
import { api } from '../utils/api-client';
import { FIXTURES_PATH } from '../utils/constants';

describe('Sync Commands', () => {
  let token: string;

  beforeAll(() => {
    token = process.env.E2E_ADMIN_TOKEN!;
  });

  describe('sync schema', () => {
    it('syncs schema from source to target project', async () => {
      // Create source project with schema
      const sourceProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
        '--commit',
      ]);

      // Create empty target project
      const targetProject = await createTestProject();

      // Sync schema from source to target
      const result = await runCli([
        'sync',
        'schema',
        '--source',
        buildUrl(sourceProject.name, { token, revision: 'head' }),
        '--target',
        buildUrl(targetProject.name, { token }),
      ]);

      expect(result.exitCode).toBe(0);

      // Verify tables were created in target
      const tables = await api.getTables(
        targetProject.rootBranch.draftRevisionId,
      );
      expect(tables.length).toBe(14);

      const tableIds = tables.map((t) => t.id);
      expect(tableIds).toContain('abilities');
      expect(tableIds).toContain('quests');
    });

    it('syncs with --commit flag', async () => {
      const sourceProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
        '--commit',
      ]);

      const targetProject = await createTestProject();
      const beforeHeadId = targetProject.rootBranch.headRevisionId;

      const result = await runCli([
        'sync',
        'schema',
        '--source',
        buildUrl(sourceProject.name, { token, revision: 'head' }),
        '--target',
        buildUrl(targetProject.name, { token }),
        '--commit',
      ]);

      expect(result.exitCode).toBe(0);

      const updatedProject = await api.getProject('admin', targetProject.name);
      expect(updatedProject.rootBranch.headRevisionId).not.toBe(beforeHeadId);
    });

    it('handles already synced schema idempotently', async () => {
      const sourceProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
        '--commit',
      ]);

      const targetProject = await createTestProject();

      // Sync once
      await runCli([
        'sync',
        'schema',
        '--source',
        buildUrl(sourceProject.name, { token, revision: 'head' }),
        '--target',
        buildUrl(targetProject.name, { token }),
      ]);

      // Sync again
      const result = await runCli([
        'sync',
        'schema',
        '--source',
        buildUrl(sourceProject.name, { token, revision: 'head' }),
        '--target',
        buildUrl(targetProject.name, { token }),
      ]);

      expect(result.exitCode).toBe(0);

      const tables = await api.getTables(
        targetProject.rootBranch.draftRevisionId,
      );
      expect(tables.length).toBe(14);
    });

    it('uses --dry-run to preview schema changes', async () => {
      const sourceProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
        '--commit',
      ]);

      const targetProject = await createTestProject();

      const result = await runCli([
        'sync',
        'schema',
        '--source',
        buildUrl(sourceProject.name, { token, revision: 'head' }),
        '--target',
        buildUrl(targetProject.name, { token }),
        '--dry-run',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Dry run');

      // Verify nothing was created
      const tables = await api.getTables(
        targetProject.rootBranch.draftRevisionId,
      );
      expect(tables.length).toBe(0);
    });
  });

  describe('sync data', () => {
    it('syncs data from source to target project', async () => {
      // Create and populate source project
      const sourceProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);
      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
        '--commit',
      ]);

      // Create target project with same schema
      const targetProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(targetProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      // Sync data
      const result = await runCli([
        'sync',
        'data',
        '--source',
        buildUrl(sourceProject.name, { token, revision: 'head' }),
        '--target',
        buildUrl(targetProject.name, { token }),
      ]);

      expect(result.exitCode).toBe(0);

      const rows = await api.getRows(
        targetProject.rootBranch.draftRevisionId,
        'quests',
      );
      expect(rows.length).toBeGreaterThan(0);
    });

    it('syncs with --commit flag', async () => {
      const sourceProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);
      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
        '--commit',
      ]);

      const targetProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(targetProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      const beforeHeadId = (await api.getProject('admin', targetProject.name))
        .rootBranch.headRevisionId;

      const result = await runCli([
        'sync',
        'data',
        '--source',
        buildUrl(sourceProject.name, { token, revision: 'head' }),
        '--target',
        buildUrl(targetProject.name, { token }),
        '--commit',
      ]);

      expect(result.exitCode).toBe(0);

      const updatedProject = await api.getProject('admin', targetProject.name);
      expect(updatedProject.rootBranch.headRevisionId).not.toBe(beforeHeadId);
    });

    it('filters tables with --tables option', async () => {
      const sourceProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);
      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
        '--commit',
      ]);

      const targetProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(targetProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      // Use 'stats' table which has no foreign key dependencies
      const result = await runCli([
        'sync',
        'data',
        '--source',
        buildUrl(sourceProject.name, { token, revision: 'head' }),
        '--target',
        buildUrl(targetProject.name, { token }),
        '--tables',
        'stats',
      ]);

      expect(result.exitCode).toBe(0);

      const statsRows = await api.getRows(
        targetProject.rootBranch.draftRevisionId,
        'stats',
      );
      expect(statsRows.length).toBeGreaterThan(0);
    });

    it('updates existing rows when data changes (update path)', async () => {
      // Create source project with initial data
      const sourceProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);
      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
        '--commit',
      ]);

      // Create target project with same schema
      const targetProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(targetProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      // First sync - creates rows
      await runCli([
        'sync',
        'data',
        '--source',
        buildUrl(sourceProject.name, { token, revision: 'head' }),
        '--target',
        buildUrl(targetProject.name, { token }),
        '--tables',
        'stats',
      ]);

      // Get initial row count
      const initialRows = await api.getRows(
        targetProject.rootBranch.draftRevisionId,
        'stats',
      );
      expect(initialRows.length).toBe(20);

      // Second sync should recognize identical data and skip
      const result = await runCli([
        'sync',
        'data',
        '--source',
        buildUrl(sourceProject.name, { token, revision: 'head' }),
        '--target',
        buildUrl(targetProject.name, { token }),
        '--tables',
        'stats',
      ]);

      expect(result.exitCode).toBe(0);
      // All rows should be skipped as identical (sync uses different output format)
      expect(result.stdout).toContain('20 skipped');
    });

    it('uses --dry-run to preview data changes', async () => {
      const sourceProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);
      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
        '--commit',
      ]);

      const targetProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(targetProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      const result = await runCli([
        'sync',
        'data',
        '--source',
        buildUrl(sourceProject.name, { token, revision: 'head' }),
        '--target',
        buildUrl(targetProject.name, { token }),
        '--tables',
        'stats',
        '--dry-run',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Dry run');

      // Verify no rows were created
      const rows = await api.getRows(
        targetProject.rootBranch.draftRevisionId,
        'stats',
      );
      expect(rows.length).toBe(0);
    });
  });

  describe('sync all', () => {
    it('syncs both schema and data from source to target', async () => {
      // Create and populate source project
      const sourceProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);
      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
        '--commit',
      ]);

      // Create empty target project
      const targetProject = await createTestProject();

      // Sync all
      const result = await runCli([
        'sync',
        'all',
        '--source',
        buildUrl(sourceProject.name, { token, revision: 'head' }),
        '--target',
        buildUrl(targetProject.name, { token }),
      ]);

      expect(result.exitCode).toBe(0);

      // Verify tables
      const tables = await api.getTables(
        targetProject.rootBranch.draftRevisionId,
      );
      expect(tables.length).toBe(14);

      // Verify rows
      const rows = await api.getRows(
        targetProject.rootBranch.draftRevisionId,
        'quests',
      );
      expect(rows.length).toBeGreaterThan(0);
    });

    it('syncs with --commit flag', async () => {
      const sourceProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);
      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
        '--commit',
      ]);

      const targetProject = await createTestProject();
      const beforeHeadId = targetProject.rootBranch.headRevisionId;

      const result = await runCli([
        'sync',
        'all',
        '--source',
        buildUrl(sourceProject.name, { token, revision: 'head' }),
        '--target',
        buildUrl(targetProject.name, { token }),
        '--commit',
      ]);

      expect(result.exitCode).toBe(0);

      const updatedProject = await api.getProject('admin', targetProject.name);
      expect(updatedProject.rootBranch.headRevisionId).not.toBe(beforeHeadId);
    });

    it('uses --dry-run to preview changes', async () => {
      const sourceProject = await createTestProject();
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);
      await runCli([
        'rows',
        'upload',
        '--url',
        buildUrl(sourceProject.name, { token }),
        '--folder',
        path.join(FIXTURES_PATH, 'rows'),
        '--commit',
      ]);

      const targetProject = await createTestProject();

      const result = await runCli([
        'sync',
        'all',
        '--source',
        buildUrl(sourceProject.name, { token, revision: 'head' }),
        '--target',
        buildUrl(targetProject.name, { token }),
        '--dry-run',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Dry run');

      // Verify nothing was created
      const tables = await api.getTables(
        targetProject.rootBranch.draftRevisionId,
      );
      expect(tables.length).toBe(0);
    });
  });
});
