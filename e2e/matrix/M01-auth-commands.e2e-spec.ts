/**
 * Matrix M01 — Auth commands (`auth login/status/logout`).
 *
 * Standalone: one instance with `--auth`.
 * Auth axis covered: AUTH-STORED (saved API key in OS keyring).
 *
 * Prep (per suite):
 *  1. Spawn @revisium/standalone with `--auth` and `ADMIN_PASSWORD=test-admin`.
 *  2. Login via REST as admin to obtain a JWT.
 *  3. Mint two API keys via `POST /api/organizations/admin/api-keys`:
 *       - "default" (long-lived, the implicit credential name)
 *       - "automation" (short-lived, named credential)
 *  4. Allocate a per-suite credential-store service name so saved keys do not
 *     collide with the developer's real OS keyring.
 *
 * Each test runs in a fresh workspace tempdir (`createWorkspace()`) and
 * writes its own `revisium-cli.config.json` when needed.
 */

import { runCli } from '../utils/cli-runner';
import {
  CLEAR_REVISIUM_ENV,
  createWorkspace,
  removeWorkspace,
  uniqueCredentialStoreService,
  writeWorkspaceConfig,
} from '../utils/matrix-workspace';
import {
  startStandalone,
  StandaloneInstance,
} from '../utils/standalone-runner';

describe('M01 — auth commands', () => {
  let standalone: StandaloneInstance;
  let defaultApiKey: string;
  let automationApiKey: string;
  const workspaces: string[] = [];

  beforeAll(async () => {
    standalone = await startStandalone({
      auth: true,
      adminPassword: 'test-admin',
    });
    await standalone.api.login('admin', 'test-admin');
    defaultApiKey = (
      await standalone.api.mintApiKey('admin', { name: 'default' })
    ).apiKey;
    automationApiKey = (
      await standalone.api.mintApiKey('admin', { name: 'automation' })
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
    const ws = createWorkspace('revisium-cli-matrix-auth-');
    workspaces.push(ws);
    return ws;
  }

  /** Each test gets its own credential-store namespace so saved keys never
   *  bleed between cases or with the developer's keyring. */
  function envWithStore(
    extra: Record<string, string> = {},
  ): Record<string, string> {
    return {
      ...CLEAR_REVISIUM_ENV,
      REVISIUM_CREDENTIAL_STORE_SERVICE: uniqueCredentialStoreService(),
      ...extra,
    };
  }

  it('saves an API key for an --instance and surfaces it in auth status', async () => {
    const workspace = newWorkspace();
    writeWorkspaceConfig(workspace, {
      instances: {
        local: { baseUrl: standalone.baseUrl, authMode: 'stored' },
      },
    });
    const env = envWithStore();

    const login = await runCli(
      ['auth', 'login', '--instance', 'local', '--api-key-stdin'],
      { cwd: workspace, env, stdin: defaultApiKey + '\n' },
    );
    expect(login.exitCode).toBe(0);

    const status = await runCli(['auth', 'status', '--instance', 'local'], {
      cwd: workspace,
      env,
    });
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain('Saved credential found');
    expect(status.stdout).toContain('Auth mode: stored');
  });

  it('saves a named credential under --credential <name>', async () => {
    const workspace = newWorkspace();
    writeWorkspaceConfig(workspace, {
      instances: {
        local: { baseUrl: standalone.baseUrl, authMode: 'stored' },
      },
    });
    const env = envWithStore();

    const login = await runCli(
      [
        'auth',
        'login',
        '--instance',
        'local',
        '--credential',
        'automation',
        '--api-key-stdin',
      ],
      { cwd: workspace, env, stdin: automationApiKey + '\n' },
    );
    expect(login.exitCode).toBe(0);

    const automationStatus = await runCli(
      ['auth', 'status', '--instance', 'local', '--credential', 'automation'],
      { cwd: workspace, env },
    );
    expect(automationStatus.stdout).toContain('Saved credential found');

    const defaultStatus = await runCli(
      ['auth', 'status', '--instance', 'local'],
      { cwd: workspace, env },
    );
    expect(defaultStatus.stdout).toContain('No saved credential found');
  });

  it('refuses to login on an authMode "none" instance without --force', async () => {
    const workspace = newWorkspace();
    writeWorkspaceConfig(workspace, {
      instances: {
        sandbox: { baseUrl: standalone.baseUrl, authMode: 'none' },
      },
    });
    const env = envWithStore();

    const login = await runCli(
      ['auth', 'login', '--instance', 'sandbox', '--api-key-stdin'],
      { cwd: workspace, env, stdin: defaultApiKey + '\n' },
    );
    expect(login.exitCode).not.toBe(0);
    expect(login.stderr.toLowerCase()).toContain('authmode');

    const forced = await runCli(
      ['auth', 'login', '--instance', 'sandbox', '--api-key-stdin', '--force'],
      { cwd: workspace, env, stdin: defaultApiKey + '\n' },
    );
    expect(forced.exitCode).toBe(0);
  });

  it('reports "bypassed" status for authMode "none" instances', async () => {
    const workspace = newWorkspace();
    writeWorkspaceConfig(workspace, {
      instances: {
        sandbox: { baseUrl: standalone.baseUrl, authMode: 'none' },
      },
    });
    const env = envWithStore();

    const status = await runCli(['auth', 'status', '--instance', 'sandbox'], {
      cwd: workspace,
      env,
    });
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain(
      'Saved credentials are bypassed for authMode "none"',
    );
  });

  it('removes a stored credential via auth logout --instance', async () => {
    const workspace = newWorkspace();
    writeWorkspaceConfig(workspace, {
      instances: {
        local: { baseUrl: standalone.baseUrl, authMode: 'stored' },
      },
    });
    const env = envWithStore();

    await runCli(['auth', 'login', '--instance', 'local', '--api-key-stdin'], {
      cwd: workspace,
      env,
      stdin: defaultApiKey + '\n',
    });

    const logout = await runCli(['auth', 'logout', '--instance', 'local'], {
      cwd: workspace,
      env,
    });
    expect(logout.exitCode).toBe(0);

    const status = await runCli(['auth', 'status', '--instance', 'local'], {
      cwd: workspace,
      env,
    });
    expect(status.stdout).toContain('No saved credential found');
  });

  it('login --url derives the instance for first-time setup', async () => {
    const workspace = newWorkspace();
    const env = envWithStore();

    const login = await runCli(
      ['auth', 'login', '--url', standalone.url(), '--api-key-stdin'],
      { cwd: workspace, env, stdin: defaultApiKey + '\n' },
    );
    expect(login.exitCode).toBe(0);

    const status = await runCli(['auth', 'status', '--url', standalone.url()], {
      cwd: workspace,
      env,
    });
    expect(status.stdout).toContain('Saved credential found');
  });

  it('emits a copy-pasteable login hint when no saved credential is present', async () => {
    const workspace = newWorkspace();
    const env = envWithStore();

    const status = await runCli(['auth', 'status', '--url', standalone.url()], {
      cwd: workspace,
      env,
    });
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toMatch(/auth login.*--api-key/);
  });
});
