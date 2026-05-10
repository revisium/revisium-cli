import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildUrl, runCli } from '../utils/cli-runner';
import { deleteTestProject, generateProjectName } from '../utils/test-project';

const CLEAR_REVISIUM_ENV = {
  REVISIUM_URL: '',
  REVISIUM_API_KEY: '',
  REVISIUM_USERNAME: '',
  REVISIUM_PASSWORD: '',
};

describe('Bootstrap commands', () => {
  const createdProjects: string[] = [];
  let workspaces: string[] = [];

  afterEach(async () => {
    for (const projectName of createdProjects) {
      await deleteTestProject(projectName);
    }
    createdProjects.length = 0;

    for (const workspace of workspaces) {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
    workspaces = [];
  });

  it('ensures projects, endpoints, and idempotent example bootstrap resources', async () => {
    const workspace = createWorkspace();
    const projectName = generateProjectName('e2e-bootstrap');
    createdProjects.push(projectName);

    const token = process.env.E2E_ADMIN_TOKEN!;
    const targetUrl = buildUrl(projectName);
    const env = {
      ...CLEAR_REVISIUM_ENV,
      REVISIUM_TOKEN: token,
    };

    const projectEnsure = await runCli(
      ['project', 'ensure', '--url', targetUrl],
      { cwd: workspace, env },
    );

    expect(projectEnsure.exitCode).toBe(0);
    expect(projectEnsure.stdout).toContain('Created project');

    const endpointEnsure = await runCli(
      ['endpoint', 'ensure', '--url', targetUrl, '--type', 'REST_API'],
      { cwd: workspace, env },
    );

    expect(endpointEnsure.exitCode).toBe(0);
    expect(endpointEnsure.stdout).toContain('REST_API');

    const configPath = path.join(workspace, 'bootstrap.config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          projectName,
          branchName: 'master',
          endpoints: ['GRAPHQL'],
          tables: [
            {
              id: 'FaqCategory',
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', default: '' } },
                additionalProperties: false,
              },
            },
          ],
          rows: [
            {
              tableId: 'FaqCategory',
              rowId: 'billing',
              data: { name: 'Billing' },
            },
          ],
          commitMessage: 'Bootstrap dictionary example',
        },
        null,
        2,
      ),
      'utf-8',
    );

    const firstBootstrap = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        targetUrl,
        '--json',
      ],
      { cwd: workspace, env, timeout: 90000 },
    );

    expect(firstBootstrap.exitCode).toBe(0);
    const firstSummary = JSON.parse(firstBootstrap.stdout) as {
      tables: { created: string[] };
      rows: { created: string[] };
      endpoints: { created: string[] };
    };
    expect(firstSummary.tables.created).toEqual(['FaqCategory']);
    expect(firstSummary.rows.created).toEqual(['FaqCategory/billing']);
    expect(firstSummary.endpoints.created).toEqual(['GRAPHQL']);

    const secondBootstrap = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        targetUrl,
        '--json',
      ],
      { cwd: workspace, env, timeout: 90000 },
    );

    expect(secondBootstrap.exitCode).toBe(0);
    const secondSummary = JSON.parse(secondBootstrap.stdout) as {
      tables: { created: string[]; skipped: string[] };
      rows: { created: string[]; skipped: string[] };
      endpoints: { created: string[]; skipped: string[] };
    };
    expect(secondSummary.tables.created).toEqual([]);
    expect(secondSummary.tables.skipped).toEqual(['FaqCategory']);
    expect(secondSummary.rows.created).toEqual([]);
    expect(secondSummary.rows.skipped).toEqual(['FaqCategory/billing']);
    expect(secondSummary.endpoints.created).toEqual([]);
    expect(secondSummary.endpoints.skipped).toEqual(['GRAPHQL']);

    const endpointList = await runCli(
      ['endpoint', 'list', '--url', targetUrl, '--json'],
      { cwd: workspace, env },
    );

    expect(endpointList.exitCode).toBe(0);
    const listSummary = JSON.parse(endpointList.stdout) as {
      endpoints: Array<{ type: string }>;
    };
    expect(
      listSummary.endpoints.map((endpoint) => endpoint.type).sort(),
    ).toEqual(['GRAPHQL', 'REST_API']);
  }, 120000);

  it('keeps project and endpoint ensure idempotent on re-run', async () => {
    const workspace = createWorkspace();
    const projectName = generateProjectName('e2e-bootstrap-idem');
    createdProjects.push(projectName);

    const env = {
      ...CLEAR_REVISIUM_ENV,
      REVISIUM_TOKEN: process.env.E2E_ADMIN_TOKEN!,
    };
    const targetUrl = buildUrl(projectName);

    const firstProject = await runCli(
      ['project', 'ensure', '--url', targetUrl],
      { cwd: workspace, env },
    );
    expect(firstProject.exitCode).toBe(0);
    expect(firstProject.stdout).toContain('Created project');

    const secondProject = await runCli(
      ['project', 'ensure', '--url', targetUrl],
      { cwd: workspace, env },
    );
    expect(secondProject.exitCode).toBe(0);
    expect(secondProject.stdout).toContain('Project exists');

    const firstEndpoint = await runCli(
      ['endpoint', 'ensure', '--url', targetUrl, '--type', 'GRAPHQL'],
      { cwd: workspace, env },
    );
    expect(firstEndpoint.exitCode).toBe(0);
    expect(firstEndpoint.stdout).toContain('Created endpoint');

    const secondEndpoint = await runCli(
      ['endpoint', 'ensure', '--url', targetUrl, '--type', 'GRAPHQL'],
      { cwd: workspace, env },
    );
    expect(secondEndpoint.exitCode).toBe(0);
    expect(secondEndpoint.stdout).toContain('Found endpoint');
  }, 120000);

  it('plans changes in dry-run without creating resources', async () => {
    const workspace = createWorkspace();
    const projectName = generateProjectName('e2e-bootstrap-dry');
    createdProjects.push(projectName);

    const env = {
      ...CLEAR_REVISIUM_ENV,
      REVISIUM_TOKEN: process.env.E2E_ADMIN_TOKEN!,
    };
    const targetUrl = buildUrl(projectName);

    const dryRun = await runCli(
      ['project', 'ensure', '--url', targetUrl, '--dry-run', '--json'],
      { cwd: workspace, env },
    );
    expect(dryRun.exitCode).toBe(0);
    const dryRunSummary = JSON.parse(dryRun.stdout) as {
      projectStatus: string;
      branchStatus: string;
      dryRun: boolean;
    };
    expect(dryRunSummary).toMatchObject({
      projectStatus: 'created',
      branchStatus: 'created',
      dryRun: true,
    });

    // Project should still not exist after a dry run.
    const reRun = await runCli(
      ['project', 'ensure', '--url', targetUrl, '--json'],
      { cwd: workspace, env },
    );
    expect(reRun.exitCode).toBe(0);
    const reRunSummary = JSON.parse(reRun.stdout) as {
      projectStatus: string;
    };
    expect(reRunSummary.projectStatus).toBe('created');
  }, 120000);

  it('respects --endpoint overrides and --commit during example bootstrap', async () => {
    const workspace = createWorkspace();
    const projectName = generateProjectName('e2e-bootstrap-commit');
    createdProjects.push(projectName);

    const env = {
      ...CLEAR_REVISIUM_ENV,
      REVISIUM_TOKEN: process.env.E2E_ADMIN_TOKEN!,
    };
    const targetUrl = buildUrl(projectName);
    const configPath = path.join(workspace, 'bootstrap.config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          projectName,
          branchName: 'master',
          endpoints: ['GRAPHQL'],
          tables: [
            {
              id: 'Tag',
              schema: {
                type: 'object',
                required: ['label'],
                properties: { label: { type: 'string', default: '' } },
                additionalProperties: false,
              },
            },
          ],
          rows: [{ tableId: 'Tag', rowId: 'one', data: { label: 'One' } }],
          commitMessage: 'Bootstrap with overrides',
        },
        null,
        2,
      ),
      'utf-8',
    );

    const result = await runCli(
      [
        'example',
        'bootstrap',
        '--config',
        configPath,
        '--url',
        targetUrl,
        '--endpoint',
        'REST_API',
        '--commit',
        '--json',
      ],
      { cwd: workspace, env, timeout: 120000 },
    );

    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(result.stdout) as {
      endpoints: { created: string[]; skipped: string[] };
      commit: { status: string; revisionId?: string };
    };
    expect(summary.endpoints.created).toEqual(['REST_API']);
    expect(summary.endpoints.skipped).toEqual([]);
    expect(summary.commit.status).toBe('created');
    expect(summary.commit.revisionId).toBeTruthy();
  }, 180000);

  function createWorkspace(): string {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-bootstrap-'));
    workspaces.push(workspace);
    return workspace;
  }
});
