/**
 * Matrix M02 — Instance commands (`instance add/list/show/remove`).
 *
 * Standalone: one instance with `--auth` (commands operate on the workspace
 * config only, but a real baseUrl is needed for URL normalization).
 *
 * Prep:
 *  1. Spawn standalone with `--auth` and `ADMIN_PASSWORD=test-admin`.
 *  2. Login as admin (so the test can mint an API key for the
 *     `--with-credentials` removal case).
 *  3. Per-test: empty workspace tempdir; no pre-seeded config.
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

describe('M02 — instance commands', () => {
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
      await standalone.api.mintApiKey('admin', { name: 'matrix-instance' })
    ).apiKey;
  }, 180_000);

  afterAll(async () => {
    for (const workspace of workspaces) removeWorkspace(workspace);
    workspaces.length = 0;
    if (standalone) {
      await standalone.stop();
    }
  });

  function newWorkspace(): string {
    const ws = createWorkspace('revisium-cli-matrix-instance-');
    workspaces.push(ws);
    return ws;
  }

  function readWorkspaceConfig(workspace: string): unknown {
    const filePath = path.join(
      workspace,
      '.revisium',
      'revisium-cli.config.json',
    );
    if (!fs.existsSync(filePath)) return undefined;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  function env(): Record<string, string> {
    return {
      ...CLEAR_REVISIUM_ENV,
      REVISIUM_CREDENTIAL_STORE_SERVICE: credentialStoreService,
    };
  }

  it('instance add writes a non-secret entry into the workspace config', async () => {
    const workspace = newWorkspace();
    const result = await runCli(
      ['instance', 'add', 'local', '--url', standalone.url(), '--auth', 'none'],
      { cwd: workspace, env: env() },
    );
    expect(result.exitCode).toBe(0);

    const config = readWorkspaceConfig(workspace) as {
      instances: Record<string, { baseUrl: string; authMode?: string }>;
    };
    expect(config.instances.local.authMode).toBe('none');
    expect(config.instances.local.baseUrl).toContain(
      `localhost:${standalone.port}`,
    );
  });

  it('instance add accepts a full revisium URL but stores only the host', async () => {
    const workspace = newWorkspace();
    const result = await runCli(
      [
        'instance',
        'add',
        'cloud',
        '--url',
        standalone.url({ project: 'whatever' }),
      ],
      { cwd: workspace, env: env() },
    );
    expect(result.exitCode).toBe(0);

    const config = readWorkspaceConfig(workspace) as {
      instances: Record<string, { baseUrl: string }>;
    };
    expect(config.instances.cloud.baseUrl).not.toContain('whatever');
  });

  it('instance list returns all configured instances sorted by name', async () => {
    const workspace = newWorkspace();
    await runCli(['instance', 'add', 'beta', '--url', standalone.url()], {
      cwd: workspace,
      env: env(),
    });
    await runCli(['instance', 'add', 'alpha', '--url', standalone.url()], {
      cwd: workspace,
      env: env(),
    });

    const list = await runCli(['instance', 'list', '--json'], {
      cwd: workspace,
      env: env(),
    });
    expect(list.exitCode).toBe(0);
    const payload = JSON.parse(list.stdout) as {
      instances: Array<{ name: string }>;
    };
    expect(payload.instances.map((entry) => entry.name)).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('instance show prints baseUrl and authMode for the named instance', async () => {
    const workspace = newWorkspace();
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
      { cwd: workspace, env: env() },
    );

    const show = await runCli(['instance', 'show', 'local'], {
      cwd: workspace,
      env: env(),
    });
    expect(show.exitCode).toBe(0);
    expect(show.stdout).toContain('Auth mode: stored');
    expect(show.stdout).toMatch(/localhost:\d+/);
  });

  it('instance remove drops the entry; --with-credentials clears the OS keyring entry', async () => {
    const workspace = newWorkspace();
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
      { cwd: workspace, env: env() },
    );
    await runCli(['auth', 'login', '--instance', 'local', '--api-key-stdin'], {
      cwd: workspace,
      env: env(),
      stdin: apiKey + '\n',
    });

    const remove = await runCli(
      ['instance', 'remove', 'local', '--with-credentials'],
      { cwd: workspace, env: env() },
    );
    expect(remove.exitCode).toBe(0);

    const status = await runCli(['auth', 'status', '--url', standalone.url()], {
      cwd: workspace,
      env: env(),
    });
    expect(status.stdout + status.stderr).toContain(
      'No saved credential found',
    );
  });

  it('rejects re-adding an existing instance unless --force', async () => {
    const workspace = newWorkspace();
    await runCli(['instance', 'add', 'local', '--url', standalone.url()], {
      cwd: workspace,
      env: env(),
    });
    const dup = await runCli(
      ['instance', 'add', 'local', '--url', standalone.url()],
      { cwd: workspace, env: env() },
    );
    expect(dup.exitCode).not.toBe(0);

    const forced = await runCli(
      ['instance', 'add', 'local', '--url', standalone.url(), '--force'],
      { cwd: workspace, env: env() },
    );
    expect(forced.exitCode).toBe(0);
  });
});
