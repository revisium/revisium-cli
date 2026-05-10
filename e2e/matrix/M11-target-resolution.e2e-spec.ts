/**
 * Matrix M11 — Target / auth resolution precedence on a single command
 * (`project ensure`).
 *
 * Standalone: one `--auth` instance.
 *
 * Prep:
 *  1. Spawn standalone, login, mint API key.
 *  2. Workspace tempdir gets a config with two contexts and one
 *     `currentContext`.
 *  3. Project is created lazily per case so tests don't depend on each other.
 */

import { runCli } from '../utils/cli-runner';
import {
  CLEAR_REVISIUM_ENV,
  createWorkspace,
  removeWorkspace,
  writeWorkspaceConfig,
} from '../utils/matrix-workspace';
import {
  startStandalone,
  StandaloneInstance,
} from '../utils/standalone-runner';

describe('M11 — target & auth resolution', () => {
  let standalone: StandaloneInstance;
  let apiKey: string;
  let adminToken: string;
  const workspaces: string[] = [];

  beforeAll(async () => {
    standalone = await startStandalone({
      auth: true,
      adminPassword: 'test-admin',
    });
    adminToken = await standalone.api.login('admin', 'test-admin');
    apiKey = (
      await standalone.api.mintApiKey('admin', { name: 'matrix-resolution' })
    ).apiKey;
  }, 180_000);

  afterAll(async () => {
    for (const workspace of workspaces) removeWorkspace(workspace);
    workspaces.length = 0;
    await standalone.stop();
  });

  function buildWorkspace(currentContext: string): string {
    const workspace = createWorkspace('revisium-cli-matrix-resolution-');
    workspaces.push(workspace);
    writeWorkspaceConfig(workspace, {
      currentContext,
      instances: { local: { baseUrl: standalone.baseUrl, authMode: 'stored' } },
      contexts: {
        primary: {
          instance: 'local',
          organization: 'admin',
          project: 'project-primary',
        },
        secondary: {
          instance: 'local',
          organization: 'admin',
          project: 'project-secondary',
        },
      },
    });
    return workspace;
  }

  it('--url overrides --context', async () => {
    const workspace = buildWorkspace('primary');
    const projectFromUrl = `m11-url-${Date.now()}`;
    const result = await runCli(
      [
        'project',
        'ensure',
        '--context',
        'primary',
        '--url',
        standalone.url({ project: projectFromUrl }),
        '--json',
      ],
      {
        cwd: workspace,
        env: { ...CLEAR_REVISIUM_ENV, REVISIUM_API_KEY: apiKey },
      },
    );
    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(result.stdout) as { project: string };
    expect(summary.project).toBe(projectFromUrl);
  });

  it('--context overrides REVISIUM_URL', async () => {
    const workspace = buildWorkspace('primary');
    const result = await runCli(
      ['project', 'ensure', '--context', 'secondary', '--json'],
      {
        cwd: workspace,
        env: {
          ...CLEAR_REVISIUM_ENV,
          REVISIUM_URL: standalone.url({ project: 'project-from-env' }),
          REVISIUM_API_KEY: apiKey,
        },
      },
    );
    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(result.stdout) as { project: string };
    expect(summary.project).toBe('project-secondary');
  });

  it('REVISIUM_URL overrides currentContext', async () => {
    const workspace = buildWorkspace('primary');
    const result = await runCli(['project', 'ensure', '--json'], {
      cwd: workspace,
      env: {
        ...CLEAR_REVISIUM_ENV,
        REVISIUM_URL: standalone.url({ project: 'project-from-env' }),
        REVISIUM_API_KEY: apiKey,
      },
    });
    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(result.stdout) as { project: string };
    expect(summary.project).toBe('project-from-env');
  });

  it('falls back to currentContext when nothing else is set', async () => {
    const workspace = buildWorkspace('secondary');
    const result = await runCli(['project', 'ensure', '--json'], {
      cwd: workspace,
      env: { ...CLEAR_REVISIUM_ENV, REVISIUM_API_KEY: apiKey },
    });
    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(result.stdout) as { project: string };
    expect(summary.project).toBe('project-secondary');
  });

  it('--token overrides REVISIUM_API_KEY', async () => {
    const workspace = buildWorkspace('primary');
    const project = `m11-token-${Date.now()}`;
    const result = await runCli(
      [
        'project',
        'ensure',
        '--url',
        standalone.url({ project }),
        '--token',
        adminToken,
      ],
      {
        cwd: workspace,
        env: { ...CLEAR_REVISIUM_ENV, REVISIUM_API_KEY: 'wrong-key' },
      },
    );
    expect(result.exitCode).toBe(0);
  });

  it('?token=... in URL overrides REVISIUM_TOKEN', async () => {
    const workspace = buildWorkspace('primary');
    const project = `m11-url-token-${Date.now()}`;
    const result = await runCli(
      [
        'project',
        'ensure',
        '--url',
        `${standalone.url({ project })}?token=${adminToken}`,
      ],
      {
        cwd: workspace,
        env: { ...CLEAR_REVISIUM_ENV, REVISIUM_TOKEN: 'wrong-token' },
      },
    );
    expect(result.exitCode).toBe(0);
  });
});
