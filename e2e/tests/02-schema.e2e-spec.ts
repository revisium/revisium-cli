import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCli, buildUrl } from '../utils/cli-runner';
import { createTestProject } from '../utils/test-project';
import { FIXTURES_PATH } from '../utils/constants';

describe('Schema Commands', () => {
  let tempDir: string;
  let token: string;

  beforeAll(() => {
    token = process.env.E2E_ADMIN_TOKEN!;
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-schema-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('schema save', () => {
    it('saves schemas from project to folder', async () => {
      const project = await createTestProject();

      // First apply migrations
      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      // Then save schemas
      const result = await runCli([
        'schema',
        'save',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        tempDir,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Successfully saved');
      expect(result.stdout).toContain('14/14');

      // Verify files exist
      const files = fs.readdirSync(tempDir);
      expect(files).toContain('abilities.json');
      expect(files).toContain('quests.json');
      expect(files).toContain('npcs.json');
      expect(files.length).toBe(14);

      // Verify schema content
      const abilitiesSchema = JSON.parse(
        fs.readFileSync(path.join(tempDir, 'abilities.json'), 'utf-8'),
      );
      expect(abilitiesSchema.type).toBe('object');
      expect(abilitiesSchema.properties).toBeDefined();
    });

    it('creates folder if it does not exist', async () => {
      const project = await createTestProject();
      const newFolder = path.join(tempDir, 'new-folder', 'nested');

      await runCli([
        'migrate',
        'apply',
        '--url',
        buildUrl(project.name, { token }),
        '--file',
        path.join(FIXTURES_PATH, 'migrations.json'),
      ]);

      const result = await runCli([
        'schema',
        'save',
        '--url',
        buildUrl(project.name, { token }),
        '--folder',
        newFolder,
      ]);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(newFolder)).toBe(true);
    });

    it('saves empty project with no tables', async () => {
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
      expect(result.stdout).toContain('0 tables');
    });
  });

  describe('schema create-migrations', () => {
    it('creates migrations from schema files', async () => {
      const migrationsFile = path.join(tempDir, 'migrations.json');

      const result = await runCli([
        'schema',
        'create-migrations',
        '--schemas-folder',
        path.join(FIXTURES_PATH, 'schemas'),
        '--file',
        migrationsFile,
      ]);

      expect(result.exitCode).toBe(0);

      // Verify migrations file
      const migrations = JSON.parse(fs.readFileSync(migrationsFile, 'utf-8'));
      expect(Array.isArray(migrations)).toBe(true);
      expect(migrations.length).toBe(14);

      // Verify migration structure
      const firstMigration = migrations[0];
      expect(firstMigration.changeType).toBe('init');
      expect(firstMigration.tableId).toBeDefined();
      expect(firstMigration.schema).toBeDefined();
      expect(firstMigration.hash).toBeDefined();
      expect(firstMigration.id).toBeDefined();
    });

    it('creates empty migrations file with empty schemas folder', async () => {
      const emptyFolder = path.join(tempDir, 'empty');
      fs.mkdirSync(emptyFolder);
      const migrationsFile = path.join(tempDir, 'migrations.json');

      const result = await runCli([
        'schema',
        'create-migrations',
        '--schemas-folder',
        emptyFolder,
        '--file',
        migrationsFile,
      ]);

      expect(result.exitCode).toBe(0);

      const migrations = JSON.parse(fs.readFileSync(migrationsFile, 'utf-8'));
      expect(Array.isArray(migrations)).toBe(true);
      expect(migrations.length).toBe(0);
    });

    it('fails with non-existent folder', async () => {
      const result = await runCli([
        'schema',
        'create-migrations',
        '--schemas-folder',
        '/non/existent/folder',
        '--file',
        path.join(tempDir, 'migrations.json'),
      ]);

      expect(result.exitCode).toBe(1);
    });
  });
});
