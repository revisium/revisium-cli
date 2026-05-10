import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { runCli, buildUrl } from '../utils/cli-runner';
import { waitForHealthy } from '../utils/docker-helper';
import { createTestProject, generateProjectName } from '../utils/test-project';
import { FIXTURES_PATH } from '../utils/constants';

const REPO_ROOT = process.cwd();
const MIGRATIONS_FILE = path.join(REPO_ROOT, FIXTURES_PATH, 'migrations.json');
const CLEAR_REVISIUM_ENV = {
  REVISIUM_URL: '',
  REVISIUM_TOKEN: '',
  REVISIUM_API_KEY: '',
  REVISIUM_USERNAME: '',
  REVISIUM_PASSWORD: '',
  REVISIUM_CREDENTIAL_STORE_SERVICE: 'revisium-cli-e2e',
};

interface WorkspaceConfig {
  version: number;
  currentContext?: string;
  instances: Record<string, { baseUrl: string; authMode?: string }>;
  contexts: Record<
    string,
    {
      instance: string;
      credential?: string;
      organization: string;
      project: string;
      branch?: string;
      revision?: string;
    }
  >;
}

interface StandaloneHandle {
  child: ChildProcessWithoutNullStreams;
  dataDir: string;
  port: number;
  output: () => string;
}

describe('Workspace config commands', () => {
  let workspaces: string[] = [];
  let standaloneHandles: StandaloneHandle[] = [];

  afterEach(async () => {
    for (const handle of standaloneHandles) {
      await stopStandalone(handle);
    }
    standaloneHandles = [];

    for (const workspace of workspaces) {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
    workspaces = [];
  });

  it('manages instances and contexts in a single workspace config', async () => {
    const workspace = createWorkspace();
    const firstProject = await createTestProject();
    const secondProject = await createTestProject();

    const emptyInstances = await runCli(['instance', 'list'], {
      cwd: workspace,
      env: CLEAR_REVISIUM_ENV,
    });

    expect(emptyInstances.exitCode).toBe(0);
    expect(emptyInstances.stdout).toContain('No Revisium instances configured');

    const addStored = await runCli(
      ['instance', 'add', 'local', '--url', 'revisium://localhost:8082'],
      { cwd: workspace, env: CLEAR_REVISIUM_ENV },
    );
    const addNoAuth = await runCli(
      [
        'instance',
        'add',
        'local-no-auth',
        '--url',
        'revisium://localhost:8082',
        '--auth',
        'none',
      ],
      { cwd: workspace, env: CLEAR_REVISIUM_ENV },
    );

    expect(addStored.exitCode).toBe(0);
    expect(addStored.stdout).toContain('Added instance "local"');
    expect(addNoAuth.exitCode).toBe(0);
    expect(addNoAuth.stdout).toContain('auth: none');

    const showInstance = await runCli(['instance', 'show', 'local-no-auth'], {
      cwd: workspace,
      env: CLEAR_REVISIUM_ENV,
    });

    expect(showInstance.exitCode).toBe(0);
    expect(showInstance.stdout).toContain('Auth mode: none');

    const createFromUrl = await runCli(
      [
        'context',
        'create',
        'first',
        '--url',
        buildUrl(firstProject.name),
        '--instance',
        'local',
      ],
      { cwd: workspace, env: CLEAR_REVISIUM_ENV },
    );
    const createFromParts = await runCli(
      [
        'context',
        'create',
        'second',
        '--instance',
        'local',
        '--org',
        'admin',
        '--project',
        secondProject.name,
        '--revision',
        'head',
      ],
      { cwd: workspace, env: CLEAR_REVISIUM_ENV },
    );

    expect(createFromUrl.exitCode).toBe(0);
    expect(createFromUrl.stdout).toContain('Created context "first"');
    expect(createFromParts.exitCode).toBe(0);
    expect(createFromParts.stdout).toContain('admin/');
    expect(createFromParts.stdout).toContain(':head');

    const listContexts = await runCli(['context', 'list'], {
      cwd: workspace,
      env: CLEAR_REVISIUM_ENV,
    });

    expect(listContexts.exitCode).toBe(0);
    expect(listContexts.stdout).toContain('* first');
    expect(listContexts.stdout).toContain('second');

    const useSecond = await runCli(['context', 'use', 'second'], {
      cwd: workspace,
      env: CLEAR_REVISIUM_ENV,
    });
    const showCurrent = await runCli(['context', 'show'], {
      cwd: workspace,
      env: CLEAR_REVISIUM_ENV,
    });

    expect(useSecond.exitCode).toBe(0);
    expect(showCurrent.exitCode).toBe(0);
    expect(showCurrent.stdout).toContain('Name: second');
    expect(showCurrent.stdout).toContain(`Target: admin/${secondProject.name}`);
    expect(showCurrent.stdout).toContain('Credential: default');
    expect(readWorkspaceConfig(workspace).contexts.second.credential).toBe(
      undefined,
    );

    const blockedRemove = await runCli(['instance', 'remove', 'local'], {
      cwd: workspace,
      env: CLEAR_REVISIUM_ENV,
    });

    expect(blockedRemove.exitCode).toBe(1);
    expect(blockedRemove.stdout + blockedRemove.stderr).toContain(
      'used by contexts',
    );

    await expectSuccess(
      runCli(['context', 'remove', 'first'], {
        cwd: workspace,
        env: CLEAR_REVISIUM_ENV,
      }),
    );
    await expectSuccess(
      runCli(['context', 'remove', 'second'], {
        cwd: workspace,
        env: CLEAR_REVISIUM_ENV,
      }),
    );
    await expectSuccess(
      runCli(['instance', 'remove', 'local'], {
        cwd: workspace,
        env: CLEAR_REVISIUM_ENV,
      }),
    );
    await expectSuccess(
      runCli(['instance', 'remove', 'local-no-auth'], {
        cwd: workspace,
        env: CLEAR_REVISIUM_ENV,
      }),
    );

    const config = readWorkspaceConfig(workspace);
    expect(config.instances).toEqual({});
    expect(config.contexts).toEqual({});
    expect(config.currentContext).toBeUndefined();
  });

  it('uses current workspace context when --url is omitted', async () => {
    const workspace = createWorkspace();
    const project = await createTestProject();
    const token = process.env.E2E_ADMIN_TOKEN!;

    await applyMigrations(project.name, token);
    await createStoredWorkspaceContext(workspace, 'current', project.name);

    const outputDir = path.join(workspace, 'schemas');
    const result = await runCli(['schema', 'save', '--folder', outputDir], {
      cwd: workspace,
      env: {
        ...CLEAR_REVISIUM_ENV,
        REVISIUM_TOKEN: token,
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Using context current (instance: local)');
    expect(result.stdout).toContain('Authenticated as admin');
    expect(fs.readdirSync(outputDir)).toHaveLength(14);
  });

  it('uses --context to override the current workspace context', async () => {
    const workspace = createWorkspace();
    const emptyProject = await createTestProject();
    const populatedProject = await createTestProject();
    const token = process.env.E2E_ADMIN_TOKEN!;

    await applyMigrations(populatedProject.name, token);
    await createStoredWorkspaceContext(workspace, 'empty', emptyProject.name);
    await createStoredWorkspaceContext(
      workspace,
      'populated',
      populatedProject.name,
    );

    const outputDir = path.join(workspace, 'schemas-from-populated');
    const result = await runCli(
      ['schema', 'save', '--context', 'populated', '--folder', outputDir],
      {
        cwd: workspace,
        env: {
          ...CLEAR_REVISIUM_ENV,
          REVISIUM_URL: buildUrl(emptyProject.name),
          REVISIUM_TOKEN: token,
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      'Using context populated (instance: local)',
    );
    expect(result.stdout).toContain(`Project: admin/${populatedProject.name}`);
    expect(fs.readdirSync(outputDir)).toHaveLength(14);
  });

  it('fails clearly when a stored context has no credentials', async () => {
    const workspace = createWorkspace();
    const project = await createTestProject();

    await createStoredWorkspaceContext(workspace, 'needs-auth', project.name);

    const result = await runCli(
      ['schema', 'save', '--folder', path.join(workspace, 'schemas')],
      {
        cwd: workspace,
        env: CLEAR_REVISIUM_ENV,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain('No credentials found');
    expect(result.stdout + result.stderr).toContain('REVISIUM_API_KEY');
    expect(result.stdout + result.stderr).toContain('authMode "none"');
  });

  it('uses authMode none against a no-auth standalone instance', async () => {
    const workspace = createWorkspace();
    const standalone = await startNoAuthStandalone();
    standaloneHandles.push(standalone);

    const projectName = generateProjectName('e2e-noauth');
    const baseUrl = `revisium://localhost:${standalone.port}`;
    const targetUrl = `${baseUrl}/admin/${projectName}/master`;

    await expectSuccess(
      runCli(
        [
          'instance',
          'add',
          'local-no-auth',
          '--url',
          baseUrl,
          '--auth',
          'none',
        ],
        { cwd: workspace, env: CLEAR_REVISIUM_ENV },
      ),
    );
    await expectSuccess(
      runCli(['context', 'create', 'demo', '--url', targetUrl], {
        cwd: workspace,
        env: CLEAR_REVISIUM_ENV,
      }),
    );

    const migrateResult = await runCli(
      ['migrate', 'apply', '--file', MIGRATIONS_FILE, '--create-project'],
      {
        cwd: workspace,
        env: CLEAR_REVISIUM_ENV,
        timeout: 90000,
      },
    );

    expect(migrateResult.exitCode).toBe(0);
    expect(migrateResult.stdout).toContain(
      'Using context demo (instance: local-no-auth)',
    );
    expect(migrateResult.stdout).toContain('Authenticated as no auth');

    const outputDir = path.join(workspace, 'schemas-no-auth');
    const saveResult = await runCli(['schema', 'save', '--folder', outputDir], {
      cwd: workspace,
      env: CLEAR_REVISIUM_ENV,
    });

    expect(saveResult.exitCode).toBe(0);
    expect(saveResult.stdout).toContain(
      'Using context demo (instance: local-no-auth)',
    );
    expect(saveResult.stdout).toContain('Authenticated as no auth');
    expect(fs.readdirSync(outputDir)).toHaveLength(14);
  }, 120000);

  function createWorkspace(): string {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-workspace-'));
    workspaces.push(workspace);
    return workspace;
  }
});

async function createStoredWorkspaceContext(
  workspace: string,
  contextName: string,
  projectName: string,
): Promise<void> {
  await expectSuccess(
    runCli(['instance', 'add', 'local', '--url', 'revisium://localhost:8082'], {
      cwd: workspace,
      env: CLEAR_REVISIUM_ENV,
    }),
  );
  await expectSuccess(
    runCli(['context', 'create', contextName, '--url', buildUrl(projectName)], {
      cwd: workspace,
      env: CLEAR_REVISIUM_ENV,
    }),
  );
}

async function applyMigrations(
  projectName: string,
  token: string,
): Promise<void> {
  await expectSuccess(
    runCli([
      'migrate',
      'apply',
      '--url',
      buildUrl(projectName, { token }),
      '--file',
      MIGRATIONS_FILE,
    ]),
  );
}

async function expectSuccess(resultPromise: Promise<{ exitCode: number }>) {
  const result = await resultPromise;
  expect(result.exitCode).toBe(0);
}

function readWorkspaceConfig(workspace: string): WorkspaceConfig {
  return JSON.parse(
    fs.readFileSync(
      path.join(workspace, '.revisium', 'revisium-cli.config.json'),
      'utf-8',
    ),
  ) as WorkspaceConfig;
}

async function startNoAuthStandalone(): Promise<StandaloneHandle> {
  const port = await getFreePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-noauth-data-'));
  const binPath = path.join(
    REPO_ROOT,
    'node_modules',
    '@revisium',
    'standalone',
    'bin',
    'revisium-standalone.js',
  );
  let output = '';

  const child = spawn(
    process.execPath,
    [binPath, '--port', String(port), '--data', dataDir],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        FILE_PLUGIN_PUBLIC_ENDPOINT: 'https://cdn.example.com',
      },
    },
  );

  child.stdout.on('data', (data: Buffer) => {
    output += data.toString();
  });
  child.stderr.on('data', (data: Buffer) => {
    output += data.toString();
  });

  let ready = false;
  const exitedEarly = new Promise<never>((_, reject) => {
    child.once('exit', (code, signal) => {
      if (!ready) {
        reject(
          new Error(
            `No-auth standalone exited before readiness (${code ?? signal}).\n${output}`,
          ),
        );
      }
    });
  });

  try {
    await Promise.race([
      waitForHealthy(`http://localhost:${port}/health/readiness`, 90000),
      exitedEarly,
    ]);
    ready = true;
  } catch (error) {
    await stopStandalone({ child, dataDir, port, output: () => output });
    throw error;
  }

  return {
    child,
    dataDir,
    port,
    output: () => output,
  };
}

async function stopStandalone(handle: StandaloneHandle): Promise<void> {
  if (handle.child.exitCode === null && !handle.child.killed) {
    handle.child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      handle.child.once('close', () => resolve());
    });
  }

  fs.rmSync(handle.dataDir, { recursive: true, force: true });
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a free TCP port'));
        return;
      }

      server.close(() => resolve(address.port));
    });
  });
}
