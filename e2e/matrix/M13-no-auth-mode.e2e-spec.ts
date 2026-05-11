/**
 * Matrix M13 — `authMode: "none"` flow against an unauthenticated standalone.
 *
 * Standalone: one instance WITHOUT `--auth`.
 *
 * Prep:
 *  1. Spawn standalone without --auth (no admin credentials needed).
 *  2. Use REST API directly to create projects (no auth required).
 *  3. Per-test workspace tempdir.
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

describe('M13 — authMode none', () => {
  let standalone: StandaloneInstance;
  const credentialStoreService = uniqueCredentialStoreService();
  const workspaces: string[] = [];

  beforeAll(async () => {
    standalone = await startStandalone({ auth: false });
  }, 180_000);

  afterAll(async () => {
    for (const workspace of workspaces) removeWorkspace(workspace);
    workspaces.length = 0;
    if (standalone) {
      await standalone.stop();
    }
  });

  function newWorkspace(): string {
    const ws = createWorkspace('revisium-cli-matrix-noauth-');
    workspaces.push(ws);
    return ws;
  }

  function buildEnv(): Record<string, string> {
    return {
      ...CLEAR_REVISIUM_ENV,
      REVISIUM_CREDENTIAL_STORE_SERVICE: credentialStoreService,
    };
  }

  it('project ensure works against an authMode "none" instance without credentials', async () => {
    const workspace = newWorkspace();
    writeWorkspaceConfig(workspace, {
      currentContext: 'local-default',
      instances: { local: { baseUrl: standalone.baseUrl, authMode: 'none' } },
      contexts: {
        'local-default': {
          instance: 'local',
          organization: 'admin',
          project: `m13-${Date.now()}`,
        },
      },
    });
    const result = await runCli(['project', 'ensure', '--json'], {
      cwd: workspace,
      env: buildEnv(),
    });
    expect(result.exitCode).toBe(0);
  });

  it('auth login refuses to save a credential for authMode "none" without --force', async () => {
    const workspace = newWorkspace();
    writeWorkspaceConfig(workspace, {
      instances: { local: { baseUrl: standalone.baseUrl, authMode: 'none' } },
    });
    const result = await runCli(
      ['auth', 'login', '--instance', 'local', '--api-key-stdin'],
      { cwd: workspace, env: buildEnv(), stdin: 'rev_dummy\n' },
    );
    expect(result.exitCode).not.toBe(0);
  });

  it('example bootstrap with --skip-auth + raw --url works without workspace context', async () => {
    const workspace = newWorkspace();
    const project = `m13-skipauth-${Date.now()}`;
    const configPath = `${workspace}/bootstrap.config.json`;
    const fs = await import('node:fs');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        projectName: project,
        endpoints: ['REST_API'],
        tables: [],
        rows: [],
      }),
      'utf-8',
    );
    const url = `${standalone.baseUrl.replace(/^https?:\/\//, 'revisium://')}/admin/${project}/master`;
    const result = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        url,
        '--skip-auth',
        '--json',
      ],
      { cwd: workspace, env: buildEnv(), timeout: 120_000 },
    );
    expect(result.exitCode).toBe(0);
  });

  it('example bootstrap without --skip-auth against a no-auth standalone fails because stdin is not a TTY', async () => {
    const workspace = newWorkspace();
    const project = `m13-noskip-${Date.now()}`;
    const configPath = `${workspace}/bootstrap.config.json`;
    const fs = await import('node:fs');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        projectName: project,
        endpoints: ['REST_API'],
        tables: [],
        rows: [],
      }),
      'utf-8',
    );
    const url = `${standalone.baseUrl.replace(/^https?:\/\//, 'revisium://')}/admin/${project}/master`;
    const result = await runCli(
      ['example', 'bootstrap', '--config', configPath, '--url', url, '--json'],
      { cwd: workspace, env: buildEnv(), timeout: 60_000 },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(
      /No credentials found and stdin is not a TTY/,
    );
  });

  it('example bootstrap works without any credential', async () => {
    const workspace = newWorkspace();
    const project = `m13-bootstrap-${Date.now()}`;
    writeWorkspaceConfig(workspace, {
      currentContext: 'local-default',
      instances: { local: { baseUrl: standalone.baseUrl, authMode: 'none' } },
      contexts: {
        'local-default': {
          instance: 'local',
          organization: 'admin',
          project,
        },
      },
    });
    const configPath = `${workspace}/bootstrap.config.json`;
    const fs = await import('node:fs');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        projectName: project,
        endpoints: ['REST_API'],
        tables: [],
        rows: [],
      }),
      'utf-8',
    );
    const result = await runCli(
      ['example', 'bootstrap', '--config', configPath, '--json'],
      { cwd: workspace, env: buildEnv(), timeout: 120_000 },
    );
    expect(result.exitCode).toBe(0);
  });
});
