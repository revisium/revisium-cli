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

  describe('parseEndpointType', () => {
    it('returns valid types', () => {
      expect(service.parseEndpointType('REST_API')).toBe('REST_API');
      expect(service.parseEndpointType('GRAPHQL')).toBe('GRAPHQL');
    });

    it('throws for unknown types', () => {
      expect(() => service.parseEndpointType('UNKNOWN')).toThrow(
        'Endpoint type must be REST_API or GRAPHQL',
      );
    });
  });

  describe('formatEndpointHint', () => {
    it('returns the GraphQL endpoint URL', () => {
      const hint = service.formatEndpointHint(
        {
          baseUrl: 'http://localhost:9222',
          organization: 'admin',
          project: 'dictionary',
          branch: 'master',
          revision: 'draft',
          auth: { method: 'none' },
        },
        'GRAPHQL',
      );
      expect(hint).toBe(
        'http://localhost:9222/endpoint/graphql/admin/dictionary/master/draft',
      );
    });

    it('returns the REST endpoint URL with default branch and revision', () => {
      const hint = service.formatEndpointHint(
        {
          baseUrl: 'http://localhost:9222',
          organization: 'admin',
          project: 'dictionary',
          branch: '',
          revision: '',
          auth: { method: 'none' },
        } as never,
        'REST_API',
      );
      expect(hint).toBe(
        'http://localhost:9222/endpoint/rest/admin/dictionary/master/draft',
      );
    });
  });

  describe('resolveTarget', () => {
    it('delegates to ConnectionService', async () => {
      const result = await service.resolveTarget({ url: 'revisium://local' });
      expect(connectionServiceFake.resolveTarget).toHaveBeenCalledWith({
        url: 'revisium://local',
      });
      expect(result).toBe(target);
    });
  });

  describe('ensureProject', () => {
    it('rejects non-draft target before any project is created', async () => {
      connectionServiceFake.resolveTarget.mockResolvedValue({
        ...target,
        revision: 'head',
      });

      await expect(
        service.ensureProject({ url: 'revisium://local' }),
      ).rejects.toThrow('requires a draft revision');

      expect(orgScopeFake.createProject).not.toHaveBeenCalled();
      expect(projectScopeFake.createBranch).not.toHaveBeenCalled();
    });

    it('does not call createProject in dry-run mode when missing', async () => {
      projectScopeFake.get.mockRejectedValue(new Error('Project not found'));

      const result = await service.ensureProject(
        { url: 'revisium://local' },
        true,
      );

      expect(result).toMatchObject({
        projectStatus: 'created',
        branchStatus: 'created',
        dryRun: true,
      });
      expect(orgScopeFake.createProject).not.toHaveBeenCalled();
    });

    it('does not call createBranch in dry-run when branch is missing', async () => {
      apiClientFake.client.branch.mockRejectedValue(
        new Error('Branch not found'),
      );

      const result = await service.ensureProject(
        { url: 'revisium://local' },
        true,
      );

      expect(result.branchStatus).toBe('created');
      expect(projectScopeFake.createBranch).not.toHaveBeenCalled();
      expect(projectScopeFake.branch).not.toHaveBeenCalled();
    });

    it('rethrows non-not-found errors from project lookup', async () => {
      const error = Object.assign(new Error('boom'), { status: 500 });
      projectScopeFake.get.mockRejectedValue(error);

      await expect(
        service.ensureProject({ url: 'revisium://local' }),
      ).rejects.toThrow('boom');
    });

    it('rethrows non-not-found errors from branch lookup', async () => {
      const error = Object.assign(new Error('boom'), { status: 500 });
      apiClientFake.client.branch.mockRejectedValue(error);

      await expect(
        service.ensureProject({ url: 'revisium://local' }),
      ).rejects.toThrow('boom');
    });
  });

  describe('ensureEndpoint', () => {
    it('skips when an endpoint of the requested type exists', async () => {
      revisionScopeFake.getEndpoints.mockResolvedValue([
        { id: 'rest-id', type: 'REST_API' },
      ]);

      const result = await service.ensureEndpoint(
        { url: 'revisium://local' },
        'REST_API',
      );

      expect(result.status).toBe('skipped');
      expect(revisionScopeFake.createEndpoint).not.toHaveBeenCalled();
    });

    it('returns a synthetic endpoint in dry-run when missing', async () => {
      revisionScopeFake.getEndpoints.mockResolvedValue([]);

      const result = await service.ensureEndpoint(
        { url: 'revisium://local' },
        'GRAPHQL',
        true,
      );

      expect(result.status).toBe('created');
      expect(result.endpoint).toEqual({ type: 'GRAPHQL' });
      expect(revisionScopeFake.createEndpoint).not.toHaveBeenCalled();
    });

    it('creates a missing endpoint when not in dry-run', async () => {
      revisionScopeFake.getEndpoints.mockResolvedValue([]);

      const result = await service.ensureEndpoint(
        { url: 'revisium://local' },
        'REST_API',
      );

      expect(result.status).toBe('created');
      expect(revisionScopeFake.createEndpoint).toHaveBeenCalledWith({
        type: 'REST_API',
      });
    });
  });

  describe('listEndpoints', () => {
    it('returns endpoints from the resolved revision', async () => {
      const endpoints = [{ id: 'rest', type: 'REST_API' }];
      revisionScopeFake.getEndpoints.mockResolvedValue(endpoints);

      const result = await service.listEndpoints({ url: 'revisium://local' });

      expect(result).toBe(endpoints);
    });
  });

  describe('bootstrapExample validation', () => {
    it('rejects when target revision is not draft', async () => {
      connectionServiceFake.resolveTarget.mockResolvedValue({
        ...target,
        revision: 'head',
      });
      const configPath = await writeBootstrapConfig({
        tables: [tableConfig()],
        rows: [],
      });

      await expect(
        service.bootstrapExample({ url: 'revisium://local', configPath }),
      ).rejects.toThrow('requires a draft revision');
    });

    it('rejects when projectName mismatches target', async () => {
      const configPath = await writeBootstrapConfig({
        projectName: 'different',
        tables: [],
        rows: [],
      });

      await expect(
        service.bootstrapExample({ url: 'revisium://local', configPath }),
      ).rejects.toThrow(
        'Bootstrap config projectName "different" does not match target project "dictionary"',
      );
    });

    it('rejects when branchName mismatches target', async () => {
      const configPath = await writeBootstrapConfig({
        branchName: 'other',
        tables: [],
        rows: [],
      });

      await expect(
        service.bootstrapExample({ url: 'revisium://local', configPath }),
      ).rejects.toThrow(
        'Bootstrap config branchName "other" does not match target branch "master"',
      );
    });

    it('reports row conflicts and stops without writing', async () => {
      const configPath = await writeBootstrapConfig({
        tables: [],
        rows: [rowConfig()],
      });
      revisionScopeFake.getRows.mockResolvedValue({
        edges: [{ node: { id: 'billing', data: { name: 'Different' } } }],
      });

      await expect(
        service.bootstrapExample({ url: 'revisium://local', configPath }),
      ).rejects.toThrow('Bootstrap row conflict');
      expect(revisionScopeFake.createRow).not.toHaveBeenCalled();
    });

    it('honors endpoint overrides over config endpoints', async () => {
      const configPath = await writeBootstrapConfig({
        endpoints: ['REST_API'],
        tables: [],
        rows: [],
      });
      revisionScopeFake.getEndpoints.mockResolvedValue([]);

      const result = await service.bootstrapExample({
        url: 'revisium://local',
        configPath,
        endpointOverrides: ['GRAPHQL'],
      });

      expect(result.endpoints.created).toEqual(['GRAPHQL']);
      expect(revisionScopeFake.createEndpoint).toHaveBeenCalledWith({
        type: 'GRAPHQL',
      });
      expect(revisionScopeFake.createEndpoint).not.toHaveBeenCalledWith({
        type: 'REST_API',
      });
    });

    it('plans created resources without writing in dry-run when project is missing', async () => {
      projectScopeFake.get.mockRejectedValue(new Error('Project not found'));
      const configPath = await writeBootstrapConfig({
        branchName: 'master',
        endpoints: ['REST_API'],
        tables: [tableConfig()],
        rows: [rowConfig()],
        commitMessage: 'demo',
      });

      const result = await service.bootstrapExample({
        url: 'revisium://local',
        configPath,
        commit: true,
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.tables.created).toEqual(['FaqCategory']);
      expect(result.rows.created).toEqual(['FaqCategory/billing']);
      expect(result.endpoints.created).toEqual(['REST_API']);
      expect(result.commit).toEqual({ status: 'dry-run', message: 'demo' });
      expect(orgScopeFake.createProject).not.toHaveBeenCalled();
      expect(revisionScopeFake.createTable).not.toHaveBeenCalled();
      expect(revisionScopeFake.createRow).not.toHaveBeenCalled();
      expect(revisionScopeFake.createEndpoint).not.toHaveBeenCalled();
      expect(revisionScopeFake.commit).not.toHaveBeenCalled();
    });

    it('diffs against root branch head when only the branch is missing in dry-run', async () => {
      apiClientFake.client.branch.mockRejectedValue(
        new Error('Branch not found'),
      );
      projectScopeFake.branch.mockResolvedValue({
        name: 'master',
        headRevisionId: 'root-head',
      });
      const rootHeadRevisionScope = {
        getTableSchema: jest.fn().mockResolvedValue(tableConfig().schema),
        getRows: jest.fn().mockResolvedValue({
          edges: [{ node: { id: 'billing', data: rowConfig().data } }],
        }),
        getEndpoints: jest
          .fn()
          .mockResolvedValue([{ id: 'rest', type: 'REST_API' }]),
        createTable: jest.fn(),
        createRow: jest.fn(),
        createEndpoint: jest.fn(),
        commit: jest.fn(),
      };
      apiClientFake.client.revision
        .mockReset()
        .mockImplementation(({ revision }: { revision: string }) =>
          Promise.resolve(
            revision === 'root-head'
              ? rootHeadRevisionScope
              : revisionScopeFake,
          ),
        );

      const configPath = await writeBootstrapConfig({
        endpoints: ['REST_API'],
        tables: [tableConfig()],
        rows: [rowConfig()],
      });

      const result = await service.bootstrapExample({
        url: 'revisium://local/admin/dictionary/feature',
        configPath,
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.project.branchStatus).toBe('created');
      expect(result.tables.created).toEqual([]);
      expect(result.tables.skipped).toEqual(['FaqCategory']);
      expect(result.rows.created).toEqual([]);
      expect(result.rows.skipped).toEqual(['FaqCategory/billing']);
      expect(result.endpoints.created).toEqual([]);
      expect(result.endpoints.skipped).toEqual(['REST_API']);
      expect(rootHeadRevisionScope.createTable).not.toHaveBeenCalled();
      expect(rootHeadRevisionScope.createRow).not.toHaveBeenCalled();
      expect(projectScopeFake.createBranch).not.toHaveBeenCalled();
    });

    it('rejects non-draft target before any project is created', async () => {
      connectionServiceFake.resolveTarget.mockResolvedValue({
        ...target,
        revision: 'head',
      });
      const configPath = await writeBootstrapConfig({
        tables: [tableConfig()],
        rows: [],
      });

      await expect(
        service.bootstrapExample({ url: 'revisium://local', configPath }),
      ).rejects.toThrow('requires a draft revision');

      expect(orgScopeFake.createProject).not.toHaveBeenCalled();
      expect(projectScopeFake.createBranch).not.toHaveBeenCalled();
    });

    it('reports dry-run commit when there are pending changes', async () => {
      const configPath = await writeBootstrapConfig({
        tables: [tableConfig()],
        rows: [],
        commitMessage: 'demo',
      });
      revisionScopeFake.getTableSchema.mockRejectedValue(
        new Error('Table not found'),
      );

      const result = await service.bootstrapExample({
        url: 'revisium://local',
        configPath,
        commit: true,
        dryRun: true,
      });

      expect(result.commit).toEqual({ status: 'dry-run', message: 'demo' });
      expect(revisionScopeFake.commit).not.toHaveBeenCalled();
    });

    it('rethrows non-not-found errors from getTableSchema', async () => {
      const configPath = await writeBootstrapConfig({
        tables: [tableConfig()],
        rows: [],
      });
      const error = Object.assign(new Error('server error'), { status: 500 });
      revisionScopeFake.getTableSchema.mockRejectedValue(error);

      await expect(
        service.bootstrapExample({ url: 'revisium://local', configPath }),
      ).rejects.toThrow('server error');
    });

    it('uses the default commit message when none is provided', async () => {
      const configPath = await writeBootstrapConfig({
        tables: [tableConfig()],
        rows: [],
      });
      revisionScopeFake.getTableSchema.mockRejectedValue(
        new Error('Table not found'),
      );

      const result = await service.bootstrapExample({
        url: 'revisium://local',
        configPath,
        commit: true,
      });

      expect(result.commit).toEqual({
        status: 'created',
        revisionId: 'revision-1',
        message: 'Bootstrap example via revisium-cli',
      });
    });
  });

  describe('loadBootstrapConfig validation', () => {
    it('rejects non-JSON files', async () => {
      const configPath = join(tempDir, 'broken.json');
      await writeFile(configPath, 'not json', 'utf-8');

      await expect(service.loadBootstrapConfig(configPath)).rejects.toThrow(
        'Could not read bootstrap config',
      );
    });

    it('rejects when the JSON root is not an object', async () => {
      const configPath = await writeBootstrapConfig([1, 2, 3]);
      await expect(service.loadBootstrapConfig(configPath)).rejects.toThrow(
        'Bootstrap config must be a JSON object',
      );
    });

    it('rejects when "endpoints" is not an array', async () => {
      const configPath = await writeBootstrapConfig({ endpoints: 'REST_API' });
      await expect(service.loadBootstrapConfig(configPath)).rejects.toThrow(
        'field "endpoints" must be an array',
      );
    });

    it('rejects non-string entries in "endpoints"', async () => {
      const configPath = await writeBootstrapConfig({ endpoints: [42] });
      await expect(service.loadBootstrapConfig(configPath)).rejects.toThrow(
        '"endpoints[0]" must be a string',
      );
    });

    it('rejects when "tables" is not an array', async () => {
      const configPath = await writeBootstrapConfig({ tables: {} });
      await expect(service.loadBootstrapConfig(configPath)).rejects.toThrow(
        'field "tables" must be an array',
      );
    });

    it('rejects when a table is not an object', async () => {
      const configPath = await writeBootstrapConfig({ tables: ['x'] });
      await expect(service.loadBootstrapConfig(configPath)).rejects.toThrow(
        'tables[0] must be an object',
      );
    });

    it('rejects when a table id is missing or empty', async () => {
      const configPath = await writeBootstrapConfig({
        tables: [{ id: '', schema: {} }],
      });
      await expect(service.loadBootstrapConfig(configPath)).rejects.toThrow(
        'tables[0].id must be a non-empty string',
      );
    });

    it('rejects when "rows" is not an array', async () => {
      const configPath = await writeBootstrapConfig({ rows: 'x' });
      await expect(service.loadBootstrapConfig(configPath)).rejects.toThrow(
        'field "rows" must be an array',
      );
    });

    it('rejects when a row is not an object', async () => {
      const configPath = await writeBootstrapConfig({ rows: [1] });
      await expect(service.loadBootstrapConfig(configPath)).rejects.toThrow(
        'rows[0] must be an object',
      );
    });

    it('rejects when row.tableId is missing or empty', async () => {
      const configPath = await writeBootstrapConfig({
        rows: [{ tableId: '', rowId: 'r', data: {} }],
      });
      await expect(service.loadBootstrapConfig(configPath)).rejects.toThrow(
        'rows[0].tableId must be a non-empty string',
      );
    });

    it('rejects when row.rowId is missing or empty', async () => {
      const configPath = await writeBootstrapConfig({
        rows: [{ tableId: 't', rowId: '', data: {} }],
      });
      await expect(service.loadBootstrapConfig(configPath)).rejects.toThrow(
        'rows[0].rowId must be a non-empty string',
      );
    });

    it('rejects when row.data is not an object', async () => {
      const configPath = await writeBootstrapConfig({
        rows: [{ tableId: 't', rowId: 'r', data: 'x' }],
      });
      await expect(service.loadBootstrapConfig(configPath)).rejects.toThrow(
        'rows[0].data must be an object',
      );
    });

    it('rejects when an optional string field has the wrong type', async () => {
      const configPath = await writeBootstrapConfig({
        commitMessage: 42,
      });
      await expect(service.loadBootstrapConfig(configPath)).rejects.toThrow(
        'field "commitMessage" must be a string',
      );
    });

    it('parses a complete config and de-duplicates endpoint entries', async () => {
      const configPath = await writeBootstrapConfig({
        projectName: 'dictionary',
        branchName: 'master',
        endpoints: ['REST_API', 'REST_API', 'GRAPHQL'],
        tables: [tableConfig()],
        rows: [rowConfig()],
        commitMessage: 'demo',
      });

      const parsed = await service.loadBootstrapConfig(configPath);
      expect(parsed.projectName).toBe('dictionary');
      expect(parsed.branchName).toBe('master');
      expect(parsed.endpoints).toEqual(['REST_API', 'GRAPHQL']);
      expect(parsed.tables).toHaveLength(1);
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.commitMessage).toBe('demo');
    });
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
