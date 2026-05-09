import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BootstrapService } from '../bootstrap.service';
import { ConnectionService, RevisiumApiClient } from 'src/services/connection';

jest.mock('src/services/connection', () => {
  const actual: typeof import('src/services/connection') = jest.requireActual(
    'src/services/connection',
  );
  return {
    ...actual,
    RevisiumApiClient: jest.fn(),
  };
});

describe('BootstrapService', () => {
  let service: BootstrapService;
  let tempDir: string;
  let connectionServiceFake: { resolveTarget: jest.Mock };
  let apiClientFake: {
    authenticate: jest.Mock;
    client: {
      org: jest.Mock;
      branch: jest.Mock;
      revision: jest.Mock;
    };
  };
  let orgScopeFake: {
    project: jest.Mock;
    createProject: jest.Mock;
  };
  let projectScopeFake: {
    get: jest.Mock;
    branch: jest.Mock;
    createBranch: jest.Mock;
  };
  let revisionScopeFake: {
    getTableSchema: jest.Mock;
    createTable: jest.Mock;
    getRows: jest.Mock;
    createRow: jest.Mock;
    getEndpoints: jest.Mock;
    createEndpoint: jest.Mock;
    commit: jest.Mock;
  };

  const target = {
    baseUrl: 'http://localhost:9222',
    organization: 'admin',
    project: 'dictionary',
    branch: 'master',
    revision: 'draft',
    auth: { method: 'none' as const },
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'revisium-bootstrap-'));
    connectionServiceFake = {
      resolveTarget: jest.fn().mockResolvedValue(target),
    };

    revisionScopeFake = {
      getTableSchema: jest.fn(),
      createTable: jest
        .fn()
        .mockResolvedValue({ table: { id: 'FaqCategory' } }),
      getRows: jest.fn(),
      createRow: jest.fn().mockResolvedValue({ row: { id: 'billing' } }),
      getEndpoints: jest.fn(),
      createEndpoint: jest
        .fn()
        .mockImplementation((body: { type: string }) =>
          Promise.resolve({ id: `endpoint-${body.type}`, type: body.type }),
        ),
      commit: jest.fn().mockResolvedValue({ id: 'revision-1' }),
    };

    projectScopeFake = {
      get: jest.fn().mockResolvedValue({ name: 'dictionary' }),
      branch: jest.fn().mockResolvedValue({ headRevisionId: 'head-1' }),
      createBranch: jest.fn().mockResolvedValue({ name: 'master' }),
    };

    orgScopeFake = {
      project: jest.fn().mockReturnValue(projectScopeFake),
      createProject: jest.fn().mockResolvedValue({ name: 'dictionary' }),
    };

    apiClientFake = {
      authenticate: jest.fn().mockResolvedValue('admin'),
      client: {
        org: jest.fn().mockReturnValue(orgScopeFake),
        branch: jest.fn().mockResolvedValue({ name: 'master' }),
        revision: jest.fn().mockResolvedValue(revisionScopeFake),
      },
    };

    const MockApiClient = RevisiumApiClient as jest.MockedClass<
      typeof RevisiumApiClient
    >;
    MockApiClient.mockImplementation(
      () => apiClientFake as unknown as RevisiumApiClient,
    );

    service = new BootstrapService(
      connectionServiceFake as unknown as ConnectionService,
    );
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates a missing project with the target branch', async () => {
    projectScopeFake.get.mockRejectedValue(new Error('Project not found'));

    const result = await service.ensureProject({ url: 'revisium://local' });

    expect(result.projectStatus).toBe('created');
    expect(result.branchStatus).toBe('created');
    expect(orgScopeFake.createProject).toHaveBeenCalledWith({
      projectName: 'dictionary',
      branchName: 'master',
    });
  });

  it('creates a missing branch from the root branch head revision', async () => {
    apiClientFake.client.branch.mockRejectedValue(
      new Error('Branch not found'),
    );

    const result = await service.ensureProject({ url: 'revisium://local' });

    expect(result.projectStatus).toBe('skipped');
    expect(result.branchStatus).toBe('created');
    expect(projectScopeFake.createBranch).toHaveBeenCalledWith(
      'master',
      'head-1',
    );
  });

  it('reports only skipped resources when bootstrap config already matches', async () => {
    const configPath = await writeBootstrapConfig({
      endpoints: ['REST_API', 'GRAPHQL'],
      tables: [tableConfig()],
      rows: [rowConfig()],
      commitMessage: 'Bootstrap dictionary example',
    });
    revisionScopeFake.getTableSchema.mockResolvedValue(tableConfig().schema);
    revisionScopeFake.getRows.mockResolvedValue({
      edges: [{ node: { id: 'billing', data: rowConfig().data } }],
    });
    revisionScopeFake.getEndpoints.mockResolvedValue([
      { id: 'rest', type: 'REST_API' },
      { id: 'graphql', type: 'GRAPHQL' },
    ]);

    const result = await service.bootstrapExample({
      url: 'revisium://local',
      configPath,
      commit: true,
    });

    expect(result.tables.skipped).toEqual(['FaqCategory']);
    expect(result.rows.skipped).toEqual(['FaqCategory/billing']);
    expect(result.endpoints.skipped).toEqual(['REST_API', 'GRAPHQL']);
    expect(result.commit.status).toBe('skipped');
    expect(revisionScopeFake.createTable).not.toHaveBeenCalled();
    expect(revisionScopeFake.createRow).not.toHaveBeenCalled();
    expect(revisionScopeFake.createEndpoint).not.toHaveBeenCalled();
    expect(revisionScopeFake.commit).not.toHaveBeenCalled();
  });

  it('creates missing resources and commits when requested', async () => {
    const configPath = await writeBootstrapConfig({
      endpoints: ['REST_API'],
      tables: [tableConfig()],
      rows: [rowConfig()],
      commitMessage: 'Bootstrap dictionary example',
    });
    revisionScopeFake.getTableSchema.mockRejectedValue(
      new Error('Table not found'),
    );
    revisionScopeFake.getRows.mockResolvedValue({ edges: [] });
    revisionScopeFake.getEndpoints.mockResolvedValue([]);

    const result = await service.bootstrapExample({
      url: 'revisium://local',
      configPath,
      commit: true,
    });

    expect(result.tables.created).toEqual(['FaqCategory']);
    expect(result.rows.created).toEqual(['FaqCategory/billing']);
    expect(result.endpoints.created).toEqual(['REST_API']);
    expect(result.commit).toEqual({
      status: 'created',
      revisionId: 'revision-1',
      message: 'Bootstrap dictionary example',
    });
    expect(revisionScopeFake.createTable).toHaveBeenCalledWith(
      'FaqCategory',
      tableConfig().schema,
    );
    expect(revisionScopeFake.createRow).toHaveBeenCalledWith(
      'FaqCategory',
      'billing',
      rowConfig().data,
    );
    expect(revisionScopeFake.createEndpoint).toHaveBeenCalledWith({
      type: 'REST_API',
    });
  });

  it('stops on schema conflicts without writing', async () => {
    const configPath = await writeBootstrapConfig({
      tables: [tableConfig()],
      rows: [],
    });
    revisionScopeFake.getTableSchema.mockResolvedValue({
      type: 'object',
      properties: { name: { type: 'number' } },
    });

    await expect(
      service.bootstrapExample({ url: 'revisium://local', configPath }),
    ).rejects.toThrow('Bootstrap table conflict');

    expect(revisionScopeFake.createTable).not.toHaveBeenCalled();
    expect(revisionScopeFake.createRow).not.toHaveBeenCalled();
  });

  it('rejects invalid config shape', async () => {
    const configPath = await writeBootstrapConfig({
      tables: [{ id: 'FaqCategory' }],
    });

    await expect(service.loadBootstrapConfig(configPath)).rejects.toThrow(
      'tables[0].schema must be an object',
    );
  });

  async function writeBootstrapConfig(data: unknown): Promise<string> {
    const configPath = join(tempDir, 'bootstrap.config.json');
    await writeFile(configPath, JSON.stringify(data), 'utf-8');
    return configPath;
  }

  function tableConfig() {
    return {
      id: 'FaqCategory',
      schema: {
        type: 'object',
        properties: { name: { type: 'string' } },
      },
    };
  }

  function rowConfig() {
    return {
      tableId: 'FaqCategory',
      rowId: 'billing',
      data: { name: 'Billing' },
    };
  }
});
