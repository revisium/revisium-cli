/**
 * Matrix M03 — Context commands (`context create/list/show/use/remove`).
 *
 * Standalone: one `--auth` instance with two pre-seeded projects so context
 * targets resolve to real revisions.
 *
 * Prep:
 *  1. Spawn standalone with `--auth`, login, mint API key.
 *  2. Seed projects `dictionary` and `taxonomy` with default `master` branch.
 *  3. Per-test: empty workspace tempdir; `instance add local` so contexts
 *     can reference it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runCli } from '../utils/cli-runner';
import {
  CLEAR_REVISIUM_ENV,
  createWorkspace,
  removeWorkspace,
  uniqueCredentialStoreService,
} from '../utils/matrix-workspace';
import {
  startStandalone,
  StandaloneInstance,
} from '../utils/standalone-runner';

describe('M03 — context commands', () => {
  let standalone: StandaloneInstance;
  let apiKey: string;
  const credentialStoreService = uniqueCredentialStoreService();
  const workspaces: string[] = [];

  beforeAll(async () => {
    standalone = await startStandalone({
      auth: true,
      adminPassword: 'test-admin',
    });
    await standalone.api.login('admin', 'test-admin');
    apiKey = (
      await standalone.api.mintApiKey('admin', { name: 'matrix-context' })
    ).apiKey;
    await standalone.api.createProject('admin', 'dictionary');
    await standalone.api.createProject('admin', 'taxonomy');
  }, 180_000);

  afterAll(async () => {
    for (const workspace of workspaces) removeWorkspace(workspace);
    workspaces.length = 0;
    await standalone.stop();
  });

  async function setupWorkspace(): Promise<{
    workspace: string;
    env: Record<string, string>;
  }> {
    const workspace = createWorkspace('revisium-cli-matrix-context-');
    workspaces.push(workspace);
    const env: Record<string, string> = {
      ...CLEAR_REVISIUM_ENV,
      REVISIUM_API_KEY: apiKey,
      REVISIUM_CREDENTIAL_STORE_SERVICE: credentialStoreService,
    };
    await runCli(
      [
        'instance',
        'add',
        'local',
        '--url',
        standalone.url(),
        '--auth',
        'stored',
      ],
      { cwd: workspace, env },
    );
    return { workspace, env };
  }

  function readConfig(workspace: string): {
    currentContext?: string;
    contexts?: Record<string, unknown>;
  } {
    const file = path.join(workspace, '.revisium', 'revisium-cli.config.json');
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as {
      currentContext?: string;
      contexts?: Record<string, unknown>;
    };
  }

  it('context create --instance writes all parts to the workspace config', async () => {
    const { workspace, env } = await setupWorkspace();
    const result = await runCli(
      [
        'context',
        'create',
        'dictionary-local',
        '--instance',
        'local',
        '--org',
        'admin',
        '--project',
        'dictionary',
        '--branch',
        'master',
        '--revision',
        'draft',
      ],
      { cwd: workspace, env },
    );
    expect(result.exitCode).toBe(0);

    const config = readConfig(workspace);
    expect(config.contexts).toMatchObject({
      'dictionary-local': {
        instance: 'local',
        organization: 'admin',
        project: 'dictionary',
        branch: 'master',
        revision: 'draft',
      },
    });
  });

  it('context create --url parses host/org/project/branch[:rev]', async () => {
    const { workspace, env } = await setupWorkspace();
    const result = await runCli(
      [
        'context',
        'create',
        'dictionary-from-url',
        '--url',
        standalone.url({
          project: 'dictionary',
          branch: 'master',
          revision: 'draft',
        }),
      ],
      { cwd: workspace, env },
    );
    expect(result.exitCode).toBe(0);

    const config = readConfig(workspace);
    expect(config.contexts).toHaveProperty('dictionary-from-url');
  });

  it('context list / show / use round-trip', async () => {
    const { workspace, env } = await setupWorkspace();
    await runCli(
      [
        'context',
        'create',
        'dictionary-local',
        '--instance',
        'local',
        '--org',
        'admin',
        '--project',
        'dictionary',
      ],
      { cwd: workspace, env },
    );
    await runCli(
      [
        'context',
        'create',
        'taxonomy-local',
        '--instance',
        'local',
        '--org',
        'admin',
        '--project',
        'taxonomy',
      ],
      { cwd: workspace, env },
    );

    const list = await runCli(['context', 'list', '--json'], {
      cwd: workspace,
      env,
    });
    expect(list.exitCode).toBe(0);
    const listed = JSON.parse(list.stdout) as {
      contexts: Array<{ name: string }>;
    };
    expect(listed.contexts.map((c) => c.name).sort()).toEqual([
      'dictionary-local',
      'taxonomy-local',
    ]);

    const use = await runCli(['context', 'use', 'taxonomy-local'], {
      cwd: workspace,
      env,
    });
    expect(use.exitCode).toBe(0);
    expect(readConfig(workspace).currentContext).toBe('taxonomy-local');

    const show = await runCli(['context', 'show'], { cwd: workspace, env });
    expect(show.stdout).toContain('taxonomy-local');
  });

  it('context remove drops the entry and clears currentContext when active', async () => {
    const { workspace, env } = await setupWorkspace();
    await runCli(
      [
        'context',
        'create',
        'dictionary-local',
        '--instance',
        'local',
        '--org',
        'admin',
        '--project',
        'dictionary',
      ],
      { cwd: workspace, env },
    );
    await runCli(['context', 'use', 'dictionary-local'], {
      cwd: workspace,
      env,
    });

    const remove = await runCli(['context', 'remove', 'dictionary-local'], {
      cwd: workspace,
      env,
    });
    expect(remove.exitCode).toBe(0);
    expect(readConfig(workspace).currentContext).toBeUndefined();
  });

  it('rejects head/non-draft contexts when used by mutating commands', async () => {
    const { workspace, env } = await setupWorkspace();
    await runCli(
      [
        'context',
        'create',
        'dictionary-head',
        '--instance',
        'local',
        '--org',
        'admin',
        '--project',
        'dictionary',
        '--branch',
        'master',
        '--revision',
        'head',
      ],
      { cwd: workspace, env },
    );

    const ensure = await runCli(
      ['project', 'ensure', '--context', 'dictionary-head'],
      { cwd: workspace, env },
    );
    expect(ensure.exitCode).not.toBe(0);
    expect(ensure.stderr.toLowerCase()).toContain('draft');
  });
});
