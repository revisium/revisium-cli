/**
 * Matrix M05 — `endpoint ensure` and `endpoint list`.
 *
 * Standalone: one `--auth` instance.
 *
 * Prep:
 *  1. Spawn standalone, login, mint API key.
 *  2. Create project `dictionary` and seed table `Tag` so the draft revision
 *     is non-empty (endpoints are created on a revision, not the project).
 *  3. Per-test workspace tempdir.
 */

import { runCli } from '../utils/cli-runner';
import {
  CLEAR_REVISIUM_ENV,
  createWorkspace,
  removeWorkspace,
} from '../utils/matrix-workspace';
import { tagSchema } from '../utils/matrix-fixtures';
import {
  startStandalone,
  StandaloneInstance,
} from '../utils/standalone-runner';

describe('M05 — endpoint commands', () => {
  let standalone: StandaloneInstance;
  let apiKey: string;
  const projectName = `m05-${Date.now()}`;
  const workspaces: string[] = [];

  beforeAll(async () => {
    standalone = await startStandalone({
      auth: true,
      adminPassword: 'test-admin',
    });
    await standalone.api.login('admin', 'test-admin');
    apiKey = (
      await standalone.api.mintApiKey('admin', { name: 'matrix-endpoint' })
    ).apiKey;
    await standalone.api.createProject('admin', projectName);
    await standalone.api.seedTable({
      organization: 'admin',
      project: projectName,
      tableId: 'Tag',
      schema: tagSchema(),
    });
  }, 180_000);

  afterAll(async () => {
    for (const workspace of workspaces) removeWorkspace(workspace);
    workspaces.length = 0;
    if (standalone) {
      await standalone.stop();
    }
  });

  function newWorkspace(): string {
    const ws = createWorkspace('revisium-cli-matrix-endpoint-');
    workspaces.push(ws);
    return ws;
  }

  function env(): Record<string, string> {
    return { ...CLEAR_REVISIUM_ENV, REVISIUM_API_KEY: apiKey };
  }

  it('endpoint ensure creates REST_API once and is idempotent', async () => {
    const workspace = newWorkspace();
    const url = standalone.url({ project: projectName });

    const first = await runCli(
      ['endpoint', 'ensure', '--url', url, '--type', 'REST_API', '--json'],
      { cwd: workspace, env: env() },
    );
    expect(first.exitCode).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({ status: 'created' });

    const second = await runCli(
      ['endpoint', 'ensure', '--url', url, '--type', 'REST_API', '--json'],
      { cwd: workspace, env: env() },
    );
    expect(second.exitCode).toBe(0);
    expect(JSON.parse(second.stdout)).toMatchObject({ status: 'skipped' });
  });

  it('--dry-run does not create the endpoint', async () => {
    const workspace = newWorkspace();
    const ephemeralProject = `m05-dry-${Date.now()}`;
    await standalone.api.createProject('admin', ephemeralProject);
    const url = standalone.url({ project: ephemeralProject });

    const result = await runCli(
      [
        'endpoint',
        'ensure',
        '--url',
        url,
        '--type',
        'GRAPHQL',
        '--dry-run',
        '--json',
      ],
      { cwd: workspace, env: env() },
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'created',
      dryRun: true,
    });
    const list = await standalone.api.listEndpoints('admin', ephemeralProject);
    expect(list).toHaveLength(0);
  });

  it('rejects invalid --type values via parseEndpointType', async () => {
    const workspace = newWorkspace();
    const result = await runCli(
      [
        'endpoint',
        'ensure',
        '--url',
        standalone.url({ project: projectName }),
        '--type',
        'NOPE',
      ],
      { cwd: workspace, env: env() },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('REST_API');
  });

  it('endpoint list returns both endpoint types in JSON form', async () => {
    const workspace = newWorkspace();
    const url = standalone.url({ project: projectName });
    await runCli(['endpoint', 'ensure', '--url', url, '--type', 'REST_API'], {
      cwd: workspace,
      env: env(),
    });
    await runCli(['endpoint', 'ensure', '--url', url, '--type', 'GRAPHQL'], {
      cwd: workspace,
      env: env(),
    });

    const list = await runCli(['endpoint', 'list', '--url', url, '--json'], {
      cwd: workspace,
      env: env(),
    });
    expect(list.exitCode).toBe(0);
    const payload = JSON.parse(list.stdout) as {
      endpoints: Array<{ type: string }>;
    };
    expect(payload.endpoints.map((e) => e.type).sort()).toEqual([
      'GRAPHQL',
      'REST_API',
    ]);
  });

  it('endpoint list reports "No generated endpoints found" when empty', async () => {
    const workspace = newWorkspace();
    const ephemeralProject = `m05-empty-${Date.now()}`;
    await standalone.api.createProject('admin', ephemeralProject);
    const url = standalone.url({ project: ephemeralProject });

    const list = await runCli(['endpoint', 'list', '--url', url], {
      cwd: workspace,
      env: env(),
    });
    expect(list.exitCode).toBe(0);
    expect(list.stdout).toContain('No generated endpoints found');
  });
});
