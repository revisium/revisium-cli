/**
 * Matrix M14 — Two standalone instances driven from a single workspace.
 *
 * Prep:
 *  1. Spawn `primary` and `secondary` standalone instances, both `--auth`.
 *  2. Login + mint API key on each; per-suite credential-store service so
 *     saved creds for `primary` and `secondary` are isolated from the host
 *     keyring.
 *  3. Workspace tempdir holds two instances + two contexts (one per).
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

describe('M14 — multi-instance workspace', () => {
  let primary: StandaloneInstance;
  let secondary: StandaloneInstance;
  let primaryKey: string;
  let secondaryKey: string;
  const credentialStoreService = uniqueCredentialStoreService();
  const workspaces: string[] = [];

  beforeAll(async () => {
    primary = await startStandalone({
      auth: true,
      adminPassword: 'test-admin-primary',
    });
    secondary = await startStandalone({
      auth: true,
      adminPassword: 'test-admin-secondary',
    });

    await primary.api.login('admin', 'test-admin-primary');
    await secondary.api.login('admin', 'test-admin-secondary');
    primaryKey = (
      await primary.api.mintApiKey('admin', { name: 'matrix-primary' })
    ).apiKey;
    secondaryKey = (
      await secondary.api.mintApiKey('admin', { name: 'matrix-secondary' })
    ).apiKey;
  }, 360_000);

  afterAll(async () => {
    for (const workspace of workspaces) removeWorkspace(workspace);
    workspaces.length = 0;
    await Promise.all([
      primary ? primary.stop() : Promise.resolve(),
      secondary ? secondary.stop() : Promise.resolve(),
    ]);
  });

  function setup(): { workspace: string; env: Record<string, string> } {
    const workspace = createWorkspace('revisium-cli-matrix-multi-');
    workspaces.push(workspace);
    writeWorkspaceConfig(workspace, {
      instances: {
        primary: { baseUrl: primary.baseUrl, authMode: 'stored' },
        secondary: { baseUrl: secondary.baseUrl, authMode: 'stored' },
      },
      contexts: {
        'primary-default': {
          instance: 'primary',
          organization: 'admin',
          project: 'p',
        },
        'secondary-default': {
          instance: 'secondary',
          organization: 'admin',
          project: 's',
        },
      },
    });
    const env: Record<string, string> = {
      ...CLEAR_REVISIUM_ENV,
      REVISIUM_CREDENTIAL_STORE_SERVICE: credentialStoreService,
    };
    return { workspace, env };
  }

  it('saves independent credentials per instance', async () => {
    const { workspace, env } = setup();
    await runCli(
      ['auth', 'login', '--instance', 'primary', '--api-key-stdin'],
      {
        cwd: workspace,
        env,
        stdin: primaryKey + '\n',
      },
    );
    await runCli(
      ['auth', 'login', '--instance', 'secondary', '--api-key-stdin'],
      {
        cwd: workspace,
        env,
        stdin: secondaryKey + '\n',
      },
    );

    const primaryStatus = await runCli(
      ['auth', 'status', '--instance', 'primary'],
      { cwd: workspace, env },
    );
    expect(primaryStatus.stdout).toContain('Saved credential found');

    const secondaryStatus = await runCli(
      ['auth', 'status', '--instance', 'secondary'],
      { cwd: workspace, env },
    );
    expect(secondaryStatus.stdout).toContain('Saved credential found');
  });

  it('context switching flips the target between instances', async () => {
    const { workspace, env } = setup();
    await runCli(
      ['auth', 'login', '--instance', 'primary', '--api-key-stdin'],
      {
        cwd: workspace,
        env,
        stdin: primaryKey + '\n',
      },
    );
    await runCli(
      ['auth', 'login', '--instance', 'secondary', '--api-key-stdin'],
      {
        cwd: workspace,
        env,
        stdin: secondaryKey + '\n',
      },
    );

    await runCli(['context', 'use', 'primary-default'], {
      cwd: workspace,
      env,
    });
    const primaryEnsure = await runCli(['project', 'ensure', '--json'], {
      cwd: workspace,
      env,
    });
    expect(primaryEnsure.exitCode).toBe(0);
    expect(await primary.api.projectExists('admin', 'p')).toBe(true);

    await runCli(['context', 'use', 'secondary-default'], {
      cwd: workspace,
      env,
    });
    const secondaryEnsure = await runCli(['project', 'ensure', '--json'], {
      cwd: workspace,
      env,
    });
    expect(secondaryEnsure.exitCode).toBe(0);
    expect(await secondary.api.projectExists('admin', 's')).toBe(true);
  });
});
