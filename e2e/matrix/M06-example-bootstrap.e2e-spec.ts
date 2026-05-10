/**
 * Matrix M06 — `example bootstrap` end-to-end.
 *
 * Standalone: one `--auth` instance.
 *
 * Prep:
 *  1. Spawn standalone, login, mint API key.
 *  2. Per-test workspace tempdir + a fresh project name (avoids cross-test
 *     interference). Bootstrap config files are written via
 *     `writeBootstrapConfigFile()` so each test owns its on-disk fixture.
 *  3. Conflict cases pre-seed the target project via REST before invoking
 *     the CLI so the conflict path is exercised, not the create path.
 */

import { runCli } from '../utils/cli-runner';
import {
  CLEAR_REVISIUM_ENV,
  createWorkspace,
  removeWorkspace,
  writeBootstrapConfigFile,
} from '../utils/matrix-workspace';
import {
  faqRows,
  faqSchema,
  tagBootstrapConfig,
  tagSchema,
} from '../utils/matrix-fixtures';
import {
  startStandalone,
  StandaloneInstance,
} from '../utils/standalone-runner';

describe('M06 — example bootstrap', () => {
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
      await standalone.api.mintApiKey('admin', { name: 'matrix-bootstrap' })
    ).apiKey;
  }, 180_000);

  afterAll(async () => {
    for (const workspace of workspaces) removeWorkspace(workspace);
    workspaces.length = 0;
    if (standalone) {
      await standalone.stop();
    }
  });

  function freshProject(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function setup(): { workspace: string; env: Record<string, string> } {
    const workspace = createWorkspace('revisium-cli-matrix-bootstrap-');
    workspaces.push(workspace);
    return {
      workspace,
      env: { ...CLEAR_REVISIUM_ENV, REVISIUM_API_KEY: apiKey },
    };
  }

  it('creates everything on first run, reports skipped on second run', async () => {
    const { workspace, env } = setup();
    const project = freshProject('m06-idem');
    const configPath = writeBootstrapConfigFile(
      workspace,
      tagBootstrapConfig(project),
    );

    const first = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        standalone.url({ project }),
        '--json',
      ],
      { cwd: workspace, env, timeout: 120_000 },
    );
    expect(first.exitCode).toBe(0);
    const firstSummary = JSON.parse(first.stdout) as {
      tables: { created: string[] };
      rows: { created: string[] };
      endpoints: { created: string[] };
    };
    expect(firstSummary.tables.created).toEqual(['Tag']);
    expect(firstSummary.rows.created).toHaveLength(3);
    expect(firstSummary.endpoints.created).toEqual(['REST_API']);

    const second = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        standalone.url({ project }),
        '--json',
      ],
      { cwd: workspace, env, timeout: 120_000 },
    );
    expect(second.exitCode).toBe(0);
    const secondSummary = JSON.parse(second.stdout) as {
      tables: { created: string[]; skipped: string[] };
      rows: { skipped: string[] };
      endpoints: { skipped: string[] };
    };
    expect(secondSummary.tables.created).toEqual([]);
    expect(secondSummary.tables.skipped).toEqual(['Tag']);
    expect(secondSummary.rows.skipped).toHaveLength(3);
    expect(secondSummary.endpoints.skipped).toEqual(['REST_API']);
  });

  it('--commit creates a revision id', async () => {
    const { workspace, env } = setup();
    const project = freshProject('m06-commit');
    const configPath = writeBootstrapConfigFile(
      workspace,
      tagBootstrapConfig(project),
    );

    const result = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        standalone.url({ project }),
        '--commit',
        '--json',
      ],
      { cwd: workspace, env, timeout: 180_000 },
    );
    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(result.stdout) as {
      commit: { status: string; revisionId?: string };
    };
    expect(summary.commit.status).toBe('created');
    expect(summary.commit.revisionId).toBeTruthy();
  });

  it('--dry-run does not write to the standalone', async () => {
    const { workspace, env } = setup();
    const project = freshProject('m06-dry');
    const configPath = writeBootstrapConfigFile(
      workspace,
      tagBootstrapConfig(project),
    );

    const result = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        standalone.url({ project }),
        '--dry-run',
        '--json',
      ],
      { cwd: workspace, env, timeout: 120_000 },
    );
    expect(result.exitCode).toBe(0);
    expect(await standalone.api.projectExists('admin', project)).toBe(false);
  });

  it('--dry-run on an existing populated rootBranch reports skipped (regression)', async () => {
    const { workspace, env } = setup();
    const project = freshProject('m06-dry-existing');
    const configPath = writeBootstrapConfigFile(
      workspace,
      tagBootstrapConfig(project),
    );
    const seed = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        standalone.url({ project }),
        '--commit',
      ],
      { cwd: workspace, env, timeout: 180_000 },
    );
    expect(seed.exitCode).toBe(0);

    const result = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        standalone.url({ project, branch: 'feature' }),
        '--dry-run',
        '--json',
      ],
      { cwd: workspace, env, timeout: 120_000 },
    );
    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(result.stdout) as {
      tables: { skipped: string[]; created: string[] };
      rows: { skipped: string[]; created: string[] };
    };
    expect(summary.tables.skipped).toEqual(['Tag']);
    expect(summary.tables.created).toEqual([]);
    expect(summary.rows.created).toEqual([]);
  });

  it('--endpoint overrides config endpoints', async () => {
    const { workspace, env } = setup();
    const project = freshProject('m06-override');
    const configPath = writeBootstrapConfigFile(workspace, {
      ...tagBootstrapConfig(project),
      endpoints: ['REST_API'],
    });

    const result = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        standalone.url({ project }),
        '--endpoint',
        'GRAPHQL',
        '--json',
      ],
      { cwd: workspace, env, timeout: 120_000 },
    );
    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(result.stdout) as {
      endpoints: { created: string[] };
    };
    expect(summary.endpoints.created).toEqual(['GRAPHQL']);
  });

  it('rejects schema conflicts without writing', async () => {
    const { workspace, env } = setup();
    const project = freshProject('m06-conflict-table');
    await standalone.api.createProject('admin', project);
    await standalone.api.seedTable({
      organization: 'admin',
      project,
      tableId: 'Tag',
      schema: faqSchema(),
    });

    const configPath = writeBootstrapConfigFile(
      workspace,
      tagBootstrapConfig(project),
    );
    const result = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        standalone.url({ project }),
      ],
      { cwd: workspace, env, timeout: 120_000 },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/table conflict/i);
  });

  it('rejects row conflicts without writing', async () => {
    const { workspace, env } = setup();
    const project = freshProject('m06-conflict-row');
    await standalone.api.createProject('admin', project);
    await standalone.api.seedTable({
      organization: 'admin',
      project,
      tableId: 'Tag',
      schema: tagSchema(),
    });
    await standalone.api.seedRow({
      organization: 'admin',
      project,
      tableId: 'Tag',
      rowId: 'tag-1',
      data: { label: 'Different' },
    });

    const configPath = writeBootstrapConfigFile(
      workspace,
      tagBootstrapConfig(project),
    );
    const result = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        standalone.url({ project }),
      ],
      { cwd: workspace, env, timeout: 120_000 },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/row conflict/i);
  });

  it('rejects projectName mismatch', async () => {
    const { workspace, env } = setup();
    const project = freshProject('m06-name-mismatch');
    const configPath = writeBootstrapConfigFile(workspace, {
      ...tagBootstrapConfig(project),
      projectName: 'something-else',
    });
    const result = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        standalone.url({ project }),
      ],
      { cwd: workspace, env },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('does not match target project');
  });

  it('rejects non-draft revision before any project is created (regression)', async () => {
    const { workspace, env } = setup();
    const project = freshProject('m06-non-draft');
    const configPath = writeBootstrapConfigFile(
      workspace,
      tagBootstrapConfig(project),
    );
    const result = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        standalone.url({ project, revision: 'head' }),
      ],
      { cwd: workspace, env },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('requires a draft revision');
    expect(await standalone.api.projectExists('admin', project)).toBe(false);
  });

  it.each([
    ['empty file', () => ''],
    ['array root', () => JSON.stringify([])],
    ['endpoints not array', () => JSON.stringify({ endpoints: 'rest' })],
    ['endpoint not string', () => JSON.stringify({ endpoints: [42] })],
    [
      'tables[0] missing schema',
      () => JSON.stringify({ tables: [{ id: 'X' }] }),
    ],
    [
      'tables[0].id empty',
      () =>
        JSON.stringify({ tables: [{ id: '', schema: { type: 'object' } }] }),
    ],
    [
      'rows[0].rowId empty',
      () =>
        JSON.stringify({
          rows: [{ tableId: 't', rowId: '', data: {} }],
        }),
    ],
  ])('rejects invalid config: %s', async (_label, build) => {
    const { workspace, env } = setup();
    const configPath = writeBootstrapConfigFile(workspace, build());
    const result = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        standalone.url({ project: 'irrelevant' }),
      ],
      { cwd: workspace, env },
    );
    expect(result.exitCode).not.toBe(0);
  });

  it('faq fixture round-trips cleanly', async () => {
    const { workspace, env } = setup();
    const project = freshProject('m06-faq');
    const configPath = writeBootstrapConfigFile(workspace, {
      projectName: project,
      branchName: 'master',
      endpoints: ['REST_API', 'GRAPHQL'],
      tables: [{ id: 'FaqCategory', schema: faqSchema() }],
      rows: faqRows(),
      commitMessage: 'faq bootstrap',
    });
    const result = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        standalone.url({ project }),
        '--commit',
        '--json',
      ],
      { cwd: workspace, env, timeout: 180_000 },
    );
    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(result.stdout) as {
      tables: { created: string[] };
      rows: { created: string[] };
    };
    expect(summary.tables.created).toEqual(['FaqCategory']);
    expect(summary.rows.created).toHaveLength(2);
  });
});
