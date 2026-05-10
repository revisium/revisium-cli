/**
 * Matrix M10 — `sync schema/data/all` between two standalone instances.
 *
 * Standalone: TWO `--auth` instances on different ports.
 *
 * Prep:
 *  1. Spawn `source` and `target` standalone instances.
 *  2. Login as admin on each, mint API keys (`SOURCE_API_KEY` / `TARGET_API_KEY`).
 *  3. Source: create project + seed tables + rows.
 *  4. Target: create empty project (sync expects it to exist; for the
 *     `sync all --create-project` matrix line, leave the target absent).
 */

import { runCli } from '../utils/cli-runner';
import {
  CLEAR_REVISIUM_ENV,
  createWorkspace,
  removeWorkspace,
} from '../utils/matrix-workspace';
import {
  questRows,
  questSchema,
  tagRows,
  tagSchema,
} from '../utils/matrix-fixtures';
import {
  startStandalone,
  StandaloneInstance,
} from '../utils/standalone-runner';

describe('M10 — sync', () => {
  let source: StandaloneInstance;
  let target: StandaloneInstance;
  let sourceApiKey: string;
  let targetApiKey: string;
  const sourceProject = `m10-source-${Date.now()}`;
  const targetProject = `m10-target-${Date.now()}`;
  const workspaces: string[] = [];

  beforeAll(async () => {
    source = await startStandalone({
      auth: true,
      adminPassword: 'test-admin',
    });
    target = await startStandalone({
      auth: true,
      adminPassword: 'test-admin',
    });

    await source.api.login('admin', 'test-admin');
    await target.api.login('admin', 'test-admin');
    sourceApiKey = (
      await source.api.mintApiKey('admin', { name: 'matrix-sync-source' })
    ).apiKey;
    targetApiKey = (
      await target.api.mintApiKey('admin', { name: 'matrix-sync-target' })
    ).apiKey;

    await source.api.createProject('admin', sourceProject);
    await source.api.seedTable({
      organization: 'admin',
      project: sourceProject,
      tableId: 'Tag',
      schema: tagSchema(),
    });
    await source.api.seedTable({
      organization: 'admin',
      project: sourceProject,
      tableId: 'Quest',
      schema: questSchema(),
    });
    for (const row of [...tagRows(3), ...questRows(5)]) {
      await source.api.seedRow({
        organization: 'admin',
        project: sourceProject,
        ...row,
      });
    }

    await target.api.createProject('admin', targetProject);
  }, 360_000);

  afterAll(async () => {
    for (const workspace of workspaces) removeWorkspace(workspace);
    workspaces.length = 0;
    await Promise.all([
      source ? source.stop() : Promise.resolve(),
      target ? target.stop() : Promise.resolve(),
    ]);
  });

  function setup(): { workspace: string; env: Record<string, string> } {
    const workspace = createWorkspace('revisium-cli-matrix-sync-');
    workspaces.push(workspace);
    return {
      workspace,
      env: {
        ...CLEAR_REVISIUM_ENV,
        REVISIUM_SOURCE_API_KEY: sourceApiKey,
        REVISIUM_TARGET_API_KEY: targetApiKey,
      },
    };
  }

  function sourceUrl(): string {
    return source.url({ project: sourceProject, revision: 'head' });
  }

  function targetUrl(): string {
    return target.url({ project: targetProject });
  }

  it('sync schema copies tables from source to target', async () => {
    const { workspace, env } = setup();
    const result = await runCli(
      [
        'sync',
        'schema',
        '--source',
        sourceUrl(),
        '--target',
        targetUrl(),
        '--commit',
      ],
      { cwd: workspace, env, timeout: 240_000 },
    );
    expect(result.exitCode).toBe(0);
    const targetTables = await target.api.listTables('admin', targetProject);
    expect(targetTables.map((t) => t.id).sort()).toEqual(['Quest', 'Tag']);
  });

  it('sync data copies rows once schemas match', async () => {
    const { workspace, env } = setup();
    const schema = await runCli(
      [
        'sync',
        'schema',
        '--source',
        sourceUrl(),
        '--target',
        targetUrl(),
        '--commit',
      ],
      { cwd: workspace, env, timeout: 240_000 },
    );
    expect(schema.exitCode).toBe(0);
    const result = await runCli(
      [
        'sync',
        'data',
        '--source',
        sourceUrl(),
        '--target',
        targetUrl(),
        '--commit',
      ],
      { cwd: workspace, env, timeout: 240_000 },
    );
    expect(result.exitCode).toBe(0);

    const tagRowsCopied = await target.api.listRows(
      'admin',
      targetProject,
      'Tag',
    );
    const questRowsCopied = await target.api.listRows(
      'admin',
      targetProject,
      'Quest',
    );
    expect(tagRowsCopied).toHaveLength(3);
    expect(questRowsCopied).toHaveLength(5);
  });

  it('sync all --commit performs schema + data in one shot', async () => {
    const fresh = `m10-all-${Date.now()}`;
    await target.api.createProject('admin', fresh);

    const { workspace, env } = setup();
    const result = await runCli(
      [
        'sync',
        'all',
        '--source',
        sourceUrl(),
        '--target',
        target.url({ project: fresh }),
        '--commit',
      ],
      { cwd: workspace, env, timeout: 360_000 },
    );
    expect(result.exitCode).toBe(0);
    const targetTables = await target.api.listTables('admin', fresh);
    expect(targetTables.map((t) => t.id).sort()).toEqual(['Quest', 'Tag']);
    const tagRowsCopied = await target.api.listRows('admin', fresh, 'Tag');
    const questRowsCopied = await target.api.listRows('admin', fresh, 'Quest');
    expect(tagRowsCopied).toHaveLength(3);
    expect(questRowsCopied).toHaveLength(5);
  });

  it('rejects mutually-exclusive auth: both ?token=... and REVISIUM_TARGET_TOKEN', async () => {
    const { workspace } = setup();
    const env: Record<string, string> = {
      ...CLEAR_REVISIUM_ENV,
      REVISIUM_SOURCE_API_KEY: sourceApiKey,
      REVISIUM_TARGET_TOKEN: 'env-token',
    };
    const result = await runCli(
      [
        'sync',
        'schema',
        '--source',
        sourceUrl(),
        '--target',
        `${targetUrl()}?token=url-token`,
      ],
      { cwd: workspace, env },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toLowerCase()).toMatch(
      /(mutually[- ]exclusive|conflict|both.*token)/,
    );
  });
});
