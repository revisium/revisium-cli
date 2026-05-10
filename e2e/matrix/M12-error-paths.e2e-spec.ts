/**
 * Matrix M12 — Error paths and remediation messages.
 *
 * Standalone: one `--auth` instance.
 *
 * Prep: spawn standalone, login, mint a key. Tests deliberately send the
 * wrong credentials, missing files, malformed config, etc., and assert on
 * non-zero exit codes + helpful stderr.
 */

import * as fs from 'node:fs';
import { runCli } from '../utils/cli-runner';
import {
  CLEAR_REVISIUM_ENV,
  createWorkspace,
  removeWorkspace,
  writeWorkspaceConfig,
  workspaceFile,
} from '../utils/matrix-workspace';
import {
  startStandalone,
  StandaloneInstance,
} from '../utils/standalone-runner';

describe('M12 — error paths', () => {
  let standalone: StandaloneInstance;
  let apiKey: string;
  const workspaces: string[] = [];

  beforeAll(async () => {
    standalone = await startStandalone({
      auth: true,
      adminPassword: 'test-admin',
    });
    await standalone.api.login('admin', 'test-admin');
    apiKey = (
      await standalone.api.mintApiKey('admin', { name: 'matrix-errors' })
    ).apiKey;
  }, 180_000);

  afterAll(async () => {
    for (const workspace of workspaces) removeWorkspace(workspace);
    workspaces.length = 0;
    await standalone.stop();
  });

  function newWorkspace(): string {
    const ws = createWorkspace('revisium-cli-matrix-errors-');
    workspaces.push(ws);
    return ws;
  }

  it('unauthenticated request to --auth standalone surfaces an auth error', async () => {
    const workspace = newWorkspace();
    const result = await runCli(
      ['project', 'ensure', '--url', standalone.url({ project: 'whatever' })],
      { cwd: workspace, env: { ...CLEAR_REVISIUM_ENV } },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toLowerCase()).toMatch(
      /auth|credential|unauthorized|api key|401/,
    );
  });

  it('wrong API key surfaces a credential error', async () => {
    const workspace = newWorkspace();
    const result = await runCli(
      ['project', 'ensure', '--url', standalone.url({ project: 'whatever' })],
      {
        cwd: workspace,
        env: { ...CLEAR_REVISIUM_ENV, REVISIUM_API_KEY: 'invalid-key' },
      },
    );
    expect(result.exitCode).not.toBe(0);
  });

  it('broken workspace config surfaces a parse error with the file path', async () => {
    const workspace = newWorkspace();
    const path = workspaceFile(
      workspace,
      '.revisium',
      'revisium-cli.config.json',
    );
    fs.mkdirSync(workspaceFile(workspace, '.revisium'), { recursive: true });
    fs.writeFileSync(path, '{ broken json');
    const result = await runCli(['instance', 'list'], {
      cwd: workspace,
      env: CLEAR_REVISIUM_ENV,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('revisium-cli.config.json');
  });

  it('instance remove against an unknown name fails fast', async () => {
    const workspace = newWorkspace();
    writeWorkspaceConfig(workspace, { instances: {} });
    const result = await runCli(['instance', 'remove', 'unknown'], {
      cwd: workspace,
      env: CLEAR_REVISIUM_ENV,
    });
    expect(result.exitCode).not.toBe(0);
  });

  it('context use against an unknown name fails fast', async () => {
    const workspace = newWorkspace();
    writeWorkspaceConfig(workspace, {
      instances: { local: { baseUrl: standalone.baseUrl } },
      contexts: {},
    });
    const result = await runCli(['context', 'use', 'unknown'], {
      cwd: workspace,
      env: CLEAR_REVISIUM_ENV,
    });
    expect(result.exitCode).not.toBe(0);
  });

  it('migrate apply with a missing file surfaces ENOENT-like error', async () => {
    const workspace = newWorkspace();
    const result = await runCli(
      [
        'migrate',
        'apply',
        '--file',
        workspaceFile(workspace, 'absent.json'),
        '--commit',
        '--url',
        standalone.url({ project: 'whatever' }),
      ],
      {
        cwd: workspace,
        env: { ...CLEAR_REVISIUM_ENV, REVISIUM_API_KEY: apiKey },
      },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toLowerCase()).toMatch(/file|not found|enoent/);
  });

  it('example bootstrap with a missing config fails before contacting the server', async () => {
    const workspace = newWorkspace();
    const result = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        workspaceFile(workspace, 'absent.json'),
        '--url',
        standalone.url({ project: 'whatever' }),
      ],
      {
        cwd: workspace,
        env: { ...CLEAR_REVISIUM_ENV, REVISIUM_API_KEY: apiKey },
      },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/Could not read bootstrap config/);
  });
});
