/**
 * Matrix M09 — `rows save` / `rows upload`.
 *
 * Standalone: one `--auth` instance.
 *
 * Prep:
 *  1. Spawn standalone, login, mint API key.
 *  2. Source project with table `Quest` + 50 rows.
 *  3. Per-test workspace tempdir for the on-disk row data folder.
 */

import * as fs from 'node:fs';
import { runCli } from '../utils/cli-runner';
import {
  CLEAR_REVISIUM_ENV,
  createWorkspace,
  removeWorkspace,
  workspaceFile,
} from '../utils/matrix-workspace';
import { questRows, questSchema } from '../utils/matrix-fixtures';
import {
  startStandalone,
  StandaloneInstance,
} from '../utils/standalone-runner';

describe('M09 — rows save / upload', () => {
  let standalone: StandaloneInstance;
  let apiKey: string;
  const sourceProject = `m09-${Date.now()}`;
  const ROWS = questRows(50);
  const workspaces: string[] = [];

  beforeAll(async () => {
    standalone = await startStandalone({
      auth: true,
      adminPassword: 'test-admin',
    });
    await standalone.api.login('admin', 'test-admin');
    apiKey = (await standalone.api.mintApiKey('admin', { name: 'matrix-rows' }))
      .apiKey;
    await standalone.api.createProject('admin', sourceProject);
    await standalone.api.seedTable({
      organization: 'admin',
      project: sourceProject,
      tableId: 'Quest',
      schema: questSchema(),
    });
    for (const row of ROWS) {
      await standalone.api.seedRow({
        organization: 'admin',
        project: sourceProject,
        ...row,
      });
    }
  }, 240_000);

  afterAll(async () => {
    for (const workspace of workspaces) removeWorkspace(workspace);
    workspaces.length = 0;
    await standalone.stop();
  });

  function setup(): { workspace: string; env: Record<string, string> } {
    const workspace = createWorkspace('revisium-cli-matrix-rows-');
    workspaces.push(workspace);
    return {
      workspace,
      env: { ...CLEAR_REVISIUM_ENV, REVISIUM_API_KEY: apiKey },
    };
  }

  it('rows save writes one folder per table with all rows', async () => {
    const { workspace, env } = setup();
    const folder = workspaceFile(workspace, 'data');
    const result = await runCli(
      [
        'rows',
        'save',
        '--folder',
        folder,
        '--url',
        standalone.url({ project: sourceProject }),
      ],
      { cwd: workspace, env, timeout: 180_000 },
    );
    expect(result.exitCode).toBe(0);
    expect(fs.readdirSync(folder)).toContain('Quest');
    const questDir = workspaceFile(workspace, 'data', 'Quest');
    expect(fs.readdirSync(questDir).length).toBe(50);
  });

  it('rows upload --commit imports rows into an empty target', async () => {
    const { workspace, env } = setup();
    const folder = workspaceFile(workspace, 'data');
    const targetProject = `m09-target-${Date.now()}`;
    await standalone.api.createProject('admin', targetProject);
    await standalone.api.seedTable({
      organization: 'admin',
      project: targetProject,
      tableId: 'Quest',
      schema: questSchema(),
    });

    await runCli(
      [
        'rows',
        'save',
        '--folder',
        folder,
        '--url',
        standalone.url({ project: sourceProject }),
      ],
      { cwd: workspace, env, timeout: 180_000 },
    );
    const upload = await runCli(
      [
        'rows',
        'upload',
        '--folder',
        folder,
        '--commit',
        '--url',
        standalone.url({ project: targetProject }),
      ],
      { cwd: workspace, env, timeout: 240_000 },
    );
    expect(upload.exitCode).toBe(0);
  });

  it('rows upload honours --batch <n>', async () => {
    const { workspace, env } = setup();
    const folder = workspaceFile(workspace, 'data');
    const targetProject = `m09-batch-${Date.now()}`;
    await standalone.api.createProject('admin', targetProject);
    await standalone.api.seedTable({
      organization: 'admin',
      project: targetProject,
      tableId: 'Quest',
      schema: questSchema(),
    });
    await runCli(
      [
        'rows',
        'save',
        '--folder',
        folder,
        '--url',
        standalone.url({ project: sourceProject }),
      ],
      { cwd: workspace, env, timeout: 180_000 },
    );

    const upload = await runCli(
      [
        'rows',
        'upload',
        '--folder',
        folder,
        '--batch',
        '5',
        '--commit',
        '--url',
        standalone.url({ project: targetProject }),
      ],
      { cwd: workspace, env, timeout: 240_000 },
    );
    expect(upload.exitCode).toBe(0);
  });
});
