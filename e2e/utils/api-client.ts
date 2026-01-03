import { E2E_CONFIG } from './constants';

export interface LoginResponse {
  accessToken: string;
}

export interface Project {
  id: string;
  name: string;
  organizationId: string;
  rootBranch: {
    id: string;
    name: string;
    draftRevisionId: string;
    headRevisionId: string;
  };
}

export interface Table {
  id: string;
  versionId: string;
}

export interface Row {
  id: string;
  versionId: string;
  data: Record<string, unknown>;
}

export class E2EApiClient {
  private token: string | null = null;

  constructor(private baseUrl: string = E2E_CONFIG.API_URL) {}

  async login(
    username: string = E2E_CONFIG.ADMIN_USERNAME,
    password: string = E2E_CONFIG.ADMIN_PASSWORD,
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUsername: username, password }),
    });

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status}`);
    }

    const data = (await response.json()) as LoginResponse;
    this.token = data.accessToken;
    return this.token;
  }

  getToken(): string {
    if (!this.token) {
      throw new Error('Not logged in');
    }
    return this.token;
  }

  setToken(token: string): void {
    this.token = token;
  }

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
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
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
      throw new Error(`GraphQL error ${response.status}: ${text}`);
    }

    const result = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };

    if (result.errors?.length) {
      throw new Error(`GraphQL error: ${result.errors[0].message}`);
    }

    return result.data as T;
  }

  async createProject(
    organizationId: string,
    projectName: string,
  ): Promise<Project> {
    const query = `
      mutation CreateProject($data: CreateProjectInput!) {
        createProject(data: $data) {
          id
          name
          organizationId
          rootBranch {
            id
            name
            draft { id }
            head { id }
          }
        }
      }
    `;

    const result = await this.graphql<{
      createProject: {
        id: string;
        name: string;
        organizationId: string;
        rootBranch: {
          id: string;
          name: string;
          draft: { id: string };
          head: { id: string };
        };
      };
    }>(query, {
      data: { organizationId, projectName },
    });

    return {
      id: result.createProject.id,
      name: result.createProject.name,
      organizationId: result.createProject.organizationId,
      rootBranch: {
        id: result.createProject.rootBranch.id,
        name: result.createProject.rootBranch.name,
        draftRevisionId: result.createProject.rootBranch.draft.id,
        headRevisionId: result.createProject.rootBranch.head.id,
      },
    };
  }

  async deleteProject(
    organizationId: string,
    projectName: string,
  ): Promise<void> {
    const query = `
      mutation DeleteProject($data: DeleteProjectInput!) {
        deleteProject(data: $data)
      }
    `;

    await this.graphql(query, {
      data: { organizationId, projectName },
    });
  }

  async getProject(
    organizationId: string,
    projectName: string,
  ): Promise<Project> {
    const query = `
      query GetProject($data: GetProjectInput!) {
        project(data: $data) {
          id
          name
          organizationId
          rootBranch {
            id
            name
            draft { id }
            head { id }
          }
        }
      }
    `;

    const result = await this.graphql<{
      project: {
        id: string;
        name: string;
        organizationId: string;
        rootBranch: {
          id: string;
          name: string;
          draft: { id: string };
          head: { id: string };
        };
      };
    }>(query, {
      data: { organizationId, projectName },
    });

    return {
      id: result.project.id,
      name: result.project.name,
      organizationId: result.project.organizationId,
      rootBranch: {
        id: result.project.rootBranch.id,
        name: result.project.rootBranch.name,
        draftRevisionId: result.project.rootBranch.draft.id,
        headRevisionId: result.project.rootBranch.head.id,
      },
    };
  }

  async getTables(revisionId: string): Promise<Table[]> {
    const query = `
      query GetTables($data: GetTablesInput!) {
        tables(data: $data) {
          edges {
            node {
              id
              versionId
            }
          }
        }
      }
    `;

    const result = await this.graphql<{
      tables: { edges: Array<{ node: Table }> };
    }>(query, {
      data: { revisionId, first: 100 },
    });

    return result.tables.edges.map((e) => e.node);
  }

  async getRows(revisionId: string, tableId: string): Promise<Row[]> {
    const query = `
      query GetRows($data: GetRowsInput!) {
        rows(data: $data) {
          edges {
            node {
              id
              versionId
              data
            }
          }
        }
      }
    `;

    const result = await this.graphql<{
      rows: { edges: Array<{ node: Row }> };
    }>(query, {
      data: { revisionId, tableId, first: 1000 },
    });

    return result.rows.edges.map((e) => e.node);
  }
}

// Singleton for tests
export const api = new E2EApiClient();
