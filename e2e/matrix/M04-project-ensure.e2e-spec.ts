/**
 * Matrix M04 — `project ensure` against a fresh standalone.
 *
 * Standalone: one `--auth` instance, no projects pre-seeded.
 *
 * Prep:
 *  1. Spawn standalone with `--auth` and `ADMIN_PASSWORD=test-admin`.
 *  2. Login as admin, mint API key (used as `REVISIUM_API_KEY`).
 *  3. Per-test: a fresh workspace tempdir; the standalone may already have
 *     leftover projects from previous tests (see project name randomization
 *     in `freshProjectName`).
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

describe('M04 — project ensure', () => {
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
      await standalone.api.mintApiKey('admin', {
        name: 'matrix-project-ensure',
      })
    ).apiKey;
  }, 180_000);

  afterAll(async () => {
    for (const workspace of workspaces) removeWorkspace(workspace);
    workspaces.length = 0;
    await standalone.stop();
  });

  function freshProjectName(prefix: string = 'm04'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function newWorkspace(): string {
    const ws = createWorkspace('revisium-cli-matrix-project-ensure-');
    workspaces.push(ws);
    return ws;
  }

  function envWithApiKey(): Record<string, string> {
    return { ...CLEAR_REVISIUM_ENV, REVISIUM_API_KEY: apiKey };
  }

  it('creates a brand-new project + master branch on first run', async () => {
    const workspace = newWorkspace();
    const project = freshProjectName();
    const result = await runCli(
      ['project', 'ensure', '--url', standalone.url({ project }), '--json'],
      { cwd: workspace, env: envWithApiKey() },
    );
    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(result.stdout) as {
      projectStatus: string;
      branchStatus: string;
      organization: string;
      project: string;
      branch: string;
    };
    expect(summary).toMatchObject({
      organization: 'admin',
      project,
      branch: 'master',
      projectStatus: 'created',
      branchStatus: 'created',
    });
    expect(await standalone.api.projectExists('admin', project)).toBe(true);
  });

  it('reports skipped on idempotent re-run', async () => {
    const workspace = newWorkspace();
    const project = freshProjectName();
    await runCli(['project', 'ensure', '--url', standalone.url({ project })], {
      cwd: workspace,
      env: envWithApiKey(),
    });
    const second = await runCli(
      ['project', 'ensure', '--url', standalone.url({ project }), '--json'],
      { cwd: workspace, env: envWithApiKey() },
    );
    expect(second.exitCode).toBe(0);
    const summary = JSON.parse(second.stdout) as {
      projectStatus: string;
      branchStatus: string;
    };
    expect(summary.projectStatus).toBe('skipped');
    expect(summary.branchStatus).toBe('skipped');
  });

  it('--dry-run reports created without writing', async () => {
    const workspace = newWorkspace();
    const project = freshProjectName();
    const dry = await runCli(
      [
        'project',
        'ensure',
        '--url',
        standalone.url({ project }),
        '--dry-run',
        '--json',
      ],
      { cwd: workspace, env: envWithApiKey() },
    );
    expect(dry.exitCode).toBe(0);
    const summary = JSON.parse(dry.stdout) as {
      dryRun: boolean;
      projectStatus: string;
    };
    expect(summary.dryRun).toBe(true);
    expect(summary.projectStatus).toBe('created');
    expect(await standalone.api.projectExists('admin', project)).toBe(false);
  });

  it('non-default branch creates a branch from rootBranch head', async () => {
    const workspace = newWorkspace();
    const project = freshProjectName();
    await runCli(['project', 'ensure', '--url', standalone.url({ project })], {
      cwd: workspace,
      env: envWithApiKey(),
    });

    const result = await runCli(
      [
        'project',
        'ensure',
        '--url',
        standalone.url({ project, branch: 'feature' }),
        '--json',
      ],
      { cwd: workspace, env: envWithApiKey() },
    );
    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(result.stdout) as {
      projectStatus: string;
      branchStatus: string;
    };
    expect(summary.projectStatus).toBe('skipped');
    expect(summary.branchStatus).toBe('created');
  });

  it('explicit --token overrides REVISIUM_API_KEY', async () => {
    const workspace = newWorkspace();
    const project = freshProjectName();
    const adminToken = await standalone.api.login('admin', 'test-admin');
    const result = await runCli(
      [
        'project',
        'ensure',
        '--url',
        standalone.url({ project }),
        '--token',
        adminToken,
        '--json',
      ],
      {
        cwd: workspace,
        env: { ...CLEAR_REVISIUM_ENV, REVISIUM_API_KEY: 'wrong-key' },
      },
    );
    expect(result.exitCode).toBe(0);
  });

  it('resolves saved credential via --instance / --context', async () => {
    const workspace = newWorkspace();
    writeWorkspaceConfig(workspace, {
      instances: { local: { baseUrl: standalone.baseUrl, authMode: 'stored' } },
    });
    const env: Record<string, string> = {
      ...CLEAR_REVISIUM_ENV,
      REVISIUM_CREDENTIAL_STORE_SERVICE: 'revisium-cli-e2e-m04',
    };
    await runCli(['auth', 'login', '--instance', 'local', '--api-key-stdin'], {
      cwd: workspace,
      env,
      stdin: apiKey + '\n',
    });

    const project = freshProjectName();
    const result = await runCli(
      ['project', 'ensure', '--url', standalone.url({ project }), '--json'],
      { cwd: workspace, env },
    );
    expect(result.exitCode).toBe(0);
  });
});
