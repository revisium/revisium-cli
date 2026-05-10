/**
 * Matrix M08 — `schema save` and `schema create-migrations`.
 *
 * Standalone: one `--auth` instance.
 *
 * Prep:
 *  1. Spawn standalone, login, mint API key.
 *  2. Source project with three tables (`Tag`, `FaqCategory`, `Quest`).
 *  3. Per-test workspace tempdir for the on-disk schema folder + migration.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runCli } from '../utils/cli-runner';
import {
  CLEAR_REVISIUM_ENV,
  createWorkspace,
  removeWorkspace,
  workspaceFile,
} from '../utils/matrix-workspace';
import { faqSchema, questSchema, tagSchema } from '../utils/matrix-fixtures';
import {
  startStandalone,
  StandaloneInstance,
} from '../utils/standalone-runner';

describe('M08 — schema', () => {
  let standalone: StandaloneInstance;
  let apiKey: string;
  const sourceProject = `m08-${Date.now()}`;
  const workspaces: string[] = [];

  beforeAll(async () => {
    standalone = await startStandalone({
      auth: true,
      adminPassword: 'test-admin',
    });
    await standalone.api.login('admin', 'test-admin');
    apiKey = (
      await standalone.api.mintApiKey('admin', { name: 'matrix-schema' })
    ).apiKey;
    await standalone.api.createProject('admin', sourceProject);
    for (const seed of [
      { id: 'Tag', schema: tagSchema() },
      { id: 'FaqCategory', schema: faqSchema() },
      { id: 'Quest', schema: questSchema() },
    ]) {
      await standalone.api.seedTable({
        organization: 'admin',
        project: sourceProject,
        tableId: seed.id,
        schema: seed.schema,
      });
    }
  }, 180_000);

  afterAll(async () => {
    for (const workspace of workspaces) removeWorkspace(workspace);
    workspaces.length = 0;
    if (standalone) {
      await standalone.stop();
    }
  });

  function setup(): { workspace: string; env: Record<string, string> } {
    const workspace = createWorkspace('revisium-cli-matrix-schema-');
    workspaces.push(workspace);
    return {
      workspace,
      env: { ...CLEAR_REVISIUM_ENV, REVISIUM_API_KEY: apiKey },
    };
  }

  it('schema save writes one JSON file per table', async () => {
    const { workspace, env } = setup();
    const folder = workspaceFile(workspace, 'schemas');
    const result = await runCli(
      [
        'schema',
        'save',
        '--folder',
        folder,
        '--url',
        standalone.url({ project: sourceProject }),
      ],
      { cwd: workspace, env, timeout: 120_000 },
    );
    expect(result.exitCode).toBe(0);
    const written = fs.readdirSync(folder).sort();
    expect(written).toEqual(['FaqCategory.json', 'Quest.json', 'Tag.json']);
  });

  it('schema create-migrations is offline and produces a migration file', async () => {
    const { workspace, env } = setup();
    const folder = workspaceFile(workspace, 'schemas');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'Tag.json'),
      JSON.stringify(tagSchema(), null, 2),
    );
    const out = workspaceFile(workspace, 'migration.json');
    const result = await runCli(
      ['schema', 'create-migrations', '--folder', folder, '--output', out],
      { cwd: workspace, env, timeout: 60_000 },
    );
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(out)).toBe(true);
    const migration = JSON.parse(fs.readFileSync(out, 'utf-8')) as unknown[];
    expect(Array.isArray(migration)).toBe(true);
    expect(migration.length).toBeGreaterThan(0);
  });

  it('round-trip: schema save → create-migrations → migrate apply matches the source', async () => {
    const { workspace, env } = setup();
    const folder = workspaceFile(workspace, 'schemas');
    const migration = workspaceFile(workspace, 'migration.json');
    const targetProject = `m08-target-${Date.now()}`;

    await runCli(
      [
        'schema',
        'save',
        '--folder',
        folder,
        '--url',
        standalone.url({ project: sourceProject }),
      ],
      { cwd: workspace, env, timeout: 120_000 },
    );
    await runCli(
      [
        'schema',
        'create-migrations',
        '--folder',
        folder,
        '--output',
        migration,
      ],
      { cwd: workspace, env, timeout: 60_000 },
    );
    await standalone.api.createProject('admin', targetProject);
    const apply = await runCli(
      [
        'migrate',
        'apply',
        '--file',
        migration,
        '--commit',
        '--url',
        standalone.url({ project: targetProject }),
      ],
      { cwd: workspace, env, timeout: 180_000 },
    );
    expect(apply.exitCode).toBe(0);

    const tables = await standalone.api.listTables('admin', targetProject);
    expect(tables.map((t) => t.id).sort()).toEqual([
      'FaqCategory',
      'Quest',
      'Tag',
    ]);
  });
});
