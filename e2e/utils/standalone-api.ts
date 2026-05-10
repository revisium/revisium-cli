/**
 * REST/GraphQL helpers used by the matrix to seed and inspect a fresh
 * `@revisium/standalone` instance. This is intentionally separate from
 * `e2e/utils/api-client.ts` (which targets the docker-compose admin instance
 * and singletons a single token) so per-suite standalone fixtures stay
 * isolated.
 */

export interface MintApiKeyOptions {
  /** Human-readable name shown in the UI. */
  name: string;
  /** ISO timestamp; omit for non-expiring keys. */
  expiresAt?: string;
}

export interface ApiKeyRecord {
  id: string;
  apiKey: string;
  name: string;
}

export interface SeedTableInput {
  organization: string;
  project: string;
  branch?: string;
  tableId: string;
  schema: object;
}

export interface SeedRowInput {
  organization: string;
  project: string;
  branch?: string;
  tableId: string;
  rowId: string;
  data: object;
}

export class StandaloneApiClient {
  private token: string | undefined;

  constructor(public readonly baseUrl: string) {}

  // --- auth -----------------------------------------------------------------

  async login(
    username: string = 'admin',
    password: string = 'test-admin',
  ): Promise<string> {
    const data = await this.request<{ accessToken: string }>(
      'POST',
      '/api/auth/login',
      { emailOrUsername: username, password },
    );
    this.token = data.accessToken;
    return this.token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  clearToken(): void {
    this.token = undefined;
  }

  /**
   * Mints a personal API key scoped to the given organization via the
   * `createPersonalApiKey` GraphQL mutation. Returns the secret string the
   * CLI should send as `--api-key` / `REVISIUM_API_KEY`.
   *
   * Note: `@revisium/standalone` does not expose API-key minting via REST yet;
   * the GraphQL mutation is the only public entry point as of 2.8.x.
   */
  async mintApiKey(
    organization: string,
    options: MintApiKeyOptions,
  ): Promise<ApiKeyRecord> {
    const data = await this.graphql<{
      createPersonalApiKey: {
        apiKey: { id: string; name: string };
        secret: string;
      };
    }>(
      `mutation($data: CreatePersonalApiKeyInput!) {
        createPersonalApiKey(data: $data) {
          apiKey { id name }
          secret
        }
      }`,
      {
        data: {
          name: options.name,
          organizationId: organization,
          ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
        },
      },
    );
    return {
      id: data.createPersonalApiKey.apiKey.id,
      apiKey: data.createPersonalApiKey.secret,
      name: data.createPersonalApiKey.apiKey.name,
    };
  }

  // --- projects -------------------------------------------------------------

  async createProject(
    organization: string,
    projectName: string,
    branchName: string = 'master',
  ): Promise<void> {
    await this.graphql(
      `mutation($data: CreateProjectInput!) { createProject(data: $data) { id } }`,
      { data: { organizationId: organization, projectName, branchName } },
    );
  }

  async deleteProject(
    organization: string,
    projectName: string,
  ): Promise<void> {
    await this.graphql(
      `mutation($data: DeleteProjectInput!) { deleteProject(data: $data) }`,
      { data: { organizationId: organization, projectName } },
    );
  }

  async projectExists(
    organization: string,
    projectName: string,
  ): Promise<boolean> {
    try {
      await this.graphql(
        `query($data: GetProjectInput!) { project(data: $data) { id } }`,
        { data: { organizationId: organization, projectName } },
      );
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  // --- branches / revisions -------------------------------------------------

  async getDraftRevisionId(
    organization: string,
    projectName: string,
    branchName: string = 'master',
  ): Promise<string> {
    const data = await this.graphql<{
      branch: { draft: { id: string } };
    }>(
      `query($data: GetBranchInput!) {
        branch(data: $data) { draft { id } }
      }`,
      {
        data: { organizationId: organization, projectName, branchName },
      },
    );
    return data.branch.draft.id;
  }

  // --- tables / rows --------------------------------------------------------

  async seedTable(input: SeedTableInput): Promise<void> {
    const revisionId = await this.getDraftRevisionId(
      input.organization,
      input.project,
      input.branch,
    );
    await this.graphql(
      `mutation($data: CreateTableInput!) {
        createTable(data: $data) { table { versionId } }
      }`,
      {
        data: { revisionId, tableId: input.tableId, schema: input.schema },
      },
    );
  }

  async seedRow(input: SeedRowInput): Promise<void> {
    const revisionId = await this.getDraftRevisionId(
      input.organization,
      input.project,
      input.branch,
    );
    await this.graphql(
      `mutation($data: CreateRowInput!) {
        createRow(data: $data) { row { versionId } }
      }`,
      {
        data: {
          revisionId,
          tableId: input.tableId,
          rowId: input.rowId,
          data: input.data,
        },
      },
    );
  }

  async listTables(
    organization: string,
    projectName: string,
    branchName: string = 'master',
  ): Promise<Array<{ id: string }>> {
    const revisionId = await this.getDraftRevisionId(
      organization,
      projectName,
      branchName,
    );
    const data = await this.graphql<{
      tables: { edges: Array<{ node: { id: string } }> };
    }>(
      `query($data: GetTablesInput!) {
        tables(data: $data) { edges { node { id } } }
      }`,
      { data: { revisionId, first: 100 } },
    );
    return data.tables.edges.map((edge) => edge.node);
  }

  async listRows(
    organization: string,
    projectName: string,
    tableId: string,
    branchName: string = 'master',
  ): Promise<Array<{ id: string; data: unknown }>> {
    const revisionId = await this.getDraftRevisionId(
      organization,
      projectName,
      branchName,
    );
    const data = await this.graphql<{
      rows: { edges: Array<{ node: { id: string; data: unknown } }> };
    }>(
      `query($data: GetRowsInput!) {
        rows(data: $data) { edges { node { id data } } }
      }`,
      { data: { revisionId, tableId, first: 1000 } },
    );
    return data.rows.edges.map((edge) => edge.node);
  }

  async listEndpoints(
    organization: string,
    projectName: string,
    branchName: string = 'master',
  ): Promise<Array<{ id: string; type: string }>> {
    const revisionId = await this.getDraftRevisionId(
      organization,
      projectName,
      branchName,
    );
    const data = await this.graphql<{
      revision: { endpoints: Array<{ id: string; type: string }> };
    }>(
      `query($data: GetRevisionInput!) {
        revision(data: $data) { endpoints { id type } }
      }`,
      { data: { revisionId } },
    );
    return data.revision.endpoints;
  }

  // --- transports -----------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `${method} ${path} failed: ${response.status} ${response.statusText} ${text}`,
      );
    }
    return (await response.json()) as T;
  }

  private async graphql<T>(query: string, variables?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    const response = await fetch(`${this.baseUrl}/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `graphql failed: ${response.status} ${response.statusText} ${text}`,
      );
    }
    const result = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (result.errors?.length) {
      throw new Error(`graphql error: ${result.errors[0].message}`);
    }
    return result.data as T;
  }
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /not.?found|404/i.test(error.message);
}
