/**
 * Matrix M07 — `migrate save` and `migrate apply`.
 *
 * Standalone: one `--auth` instance.
 *
 * Prep:
 *  1. Spawn standalone, login, mint API key.
 *  2. Source project: create + seed table `Tag` + 3 rows.
 *  3. Per-test workspace tempdir for the on-disk migration JSON.
 */

import * as fs from 'node:fs';
import { runCli } from '../utils/cli-runner';
import {
  CLEAR_REVISIUM_ENV,
  createWorkspace,
  removeWorkspace,
  workspaceFile,
} from '../utils/matrix-workspace';
import { tagRows, tagSchema } from '../utils/matrix-fixtures';
import {
  startStandalone,
  StandaloneInstance,
} from '../utils/standalone-runner';

describe('M07 — migrate', () => {
  let standalone: StandaloneInstance;
  let apiKey: string;
  const sourceProject = `m07-source-${Date.now()}`;
  const workspaces: string[] = [];

  beforeAll(async () => {
    standalone = await startStandalone({
      auth: true,
      adminPassword: 'test-admin',
    });
    await standalone.api.login('admin', 'test-admin');
    apiKey = (
      await standalone.api.mintApiKey('admin', { name: 'matrix-migrate' })
    ).apiKey;
    await standalone.api.createProject('admin', sourceProject);
    await standalone.api.seedTable({
      organization: 'admin',
      project: sourceProject,
      tableId: 'Tag',
      schema: tagSchema(),
    });
    for (const row of tagRows(3)) {
      await standalone.api.seedRow({
        organization: 'admin',
        project: sourceProject,
        ...row,
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
    const workspace = createWorkspace('revisium-cli-matrix-migrate-');
    workspaces.push(workspace);
    return {
      workspace,
      env: { ...CLEAR_REVISIUM_ENV, REVISIUM_API_KEY: apiKey },
    };
  }

  it('migrate save writes a non-empty migration JSON', async () => {
    const { workspace, env } = setup();
    const out = workspaceFile(workspace, 'migration.json');
    const result = await runCli(
      [
        'migrate',
        'save',
        '--file',
        out,
        '--url',
        standalone.url({ project: sourceProject }),
      ],
      { cwd: workspace, env, timeout: 120_000 },
    );
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(out)).toBe(true);
    const json = JSON.parse(fs.readFileSync(out, 'utf-8')) as unknown[];
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBeGreaterThan(0);
  });

  it('migrate apply --commit creates the table on an empty target project', async () => {
    const { workspace, env } = setup();
    const targetProject = `m07-target-${Date.now()}`;
    const migration = workspaceFile(workspace, 'migration.json');

    await runCli(
      [
        'migrate',
        'save',
        '--file',
        migration,
        '--url',
        standalone.url({ project: sourceProject }),
      ],
      { cwd: workspace, env, timeout: 120_000 },
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
    expect(tables.map((t) => t.id)).toContain('Tag');
  });

  it('migrate apply is idempotent on a re-run', async () => {
    const { workspace, env } = setup();
    const targetProject = `m07-idem-${Date.now()}`;
    const migration = workspaceFile(workspace, 'migration.json');
    await runCli(
      [
        'migrate',
        'save',
        '--file',
        migration,
        '--url',
        standalone.url({ project: sourceProject }),
      ],
      { cwd: workspace, env, timeout: 120_000 },
    );
    await standalone.api.createProject('admin', targetProject);

    const first = await runCli(
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
    expect(first.exitCode).toBe(0);

    const second = await runCli(
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
    expect(second.exitCode).toBe(0);
  });

  it('migrate apply --create-project creates the project before applying', async () => {
    const { workspace, env } = setup();
    const targetProject = `m07-create-${Date.now()}`;
    const migration = workspaceFile(workspace, 'migration.json');
    await runCli(
      [
        'migrate',
        'save',
        '--file',
        migration,
        '--url',
        standalone.url({ project: sourceProject }),
      ],
      { cwd: workspace, env, timeout: 120_000 },
    );

    const apply = await runCli(
      [
        'migrate',
        'apply',
        '--file',
        migration,
        '--commit',
        '--create-project',
        '--url',
        standalone.url({ project: targetProject }),
      ],
      { cwd: workspace, env, timeout: 180_000 },
    );
    expect(apply.exitCode).toBe(0);
    expect(await standalone.api.projectExists('admin', targetProject)).toBe(
      true,
    );
  });

  it('migrate apply against missing file fails fast', async () => {
    const { workspace, env } = setup();
    const result = await runCli(
      [
        'migrate',
        'apply',
        '--file',
        workspaceFile(workspace, 'absent.json'),
        '--commit',
        '--url',
        standalone.url({ project: sourceProject }),
      ],
      { cwd: workspace, env },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toLowerCase()).toMatch(/file|not found|enoent/);
  });
});
