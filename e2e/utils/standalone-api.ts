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
  /** Org-level role (e.g. `admin`, `developer`). */
  role?: string;
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
   * Mints a server API key scoped to the given organization. The exact
   * REST shape is taken from the standalone OpenAPI; tests should not depend
   * on internal field names beyond `apiKey`.
   */
  async mintApiKey(
    organization: string,
    options: MintApiKeyOptions,
  ): Promise<ApiKeyRecord> {
    const body: Record<string, unknown> = {
      name: options.name,
    };
    if (options.expiresAt) body.expiresAt = options.expiresAt;
    if (options.role) body.role = options.role;
    return this.request<ApiKeyRecord>(
      'POST',
      `/api/organizations/${encodeURIComponent(organization)}/api-keys`,
      body,
    );
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
    } catch {
      return false;
    }
  }

  // --- branches / revisions -------------------------------------------------

  async getDraftRevisionId(
    organization: string,
    projectName: string,
    branchName: string = 'master',
  ): Promise<string> {
    const data = await this.graphql<{
      project: { branch: { draft: { id: string } } };
    }>(
      `query($data: GetProjectInput!, $branch: String!) {
        project(data: $data) {
          branch(name: $branch) { draft { id } }
        }
      }`,
      {
        data: { organizationId: organization, projectName },
        branch: branchName,
      },
    );
    return data.project.branch.draft.id;
  }

  // --- tables / rows --------------------------------------------------------

  async seedTable(input: SeedTableInput): Promise<void> {
    const revisionId = await this.getDraftRevisionId(
      input.organization,
      input.project,
      input.branch,
    );
    await this.graphql(
      `mutation($data: CreateTableInput!) { createTable(data: $data) { id } }`,
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
      `mutation($data: CreateRowInput!) { createRow(data: $data) { id } }`,
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
      endpoints: Array<{ id: string; type: string }>;
    }>(
      `query($revisionId: String!) {
        endpoints(revisionId: $revisionId) { id type }
      }`,
      { revisionId },
    );
    return data.endpoints;
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
