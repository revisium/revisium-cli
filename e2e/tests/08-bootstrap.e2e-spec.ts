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

  function createWorkspace(): string {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-bootstrap-'));
    workspaces.push(workspace);
    return workspace;
  }
});
