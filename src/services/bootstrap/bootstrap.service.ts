import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { Injectable } from '@nestjs/common';
import { EndpointModel, RevisionScope, RowModel } from '@revisium/client';
import { ConnectionService, RevisiumApiClient } from 'src/services/connection';
import { RevisiumUrlComplete } from 'src/services/url';

export type EndpointType = 'REST_API' | 'GRAPHQL';

export interface TargetOptions {
  url?: string;
  context?: string;
}

export interface ProjectEnsureResult {
  organization: string;
  project: string;
  branch: string;
  projectStatus: 'created' | 'skipped';
  branchStatus: 'created' | 'skipped';
  dryRun: boolean;
}

export interface EndpointEnsureResult {
  endpoint: EndpointModel | { id?: string; type: EndpointType };
  status: 'created' | 'skipped';
  revision: string;
  dryRun: boolean;
}

export interface BootstrapConflict {
  id: string;
  reason: string;
}

export interface BootstrapResourceSummary<T = string> {
  created: T[];
  skipped: T[];
  conflicts: BootstrapConflict[];
}

export interface BootstrapCommitSummary {
  status: 'created' | 'skipped' | 'dry-run';
  revisionId?: string;
  message?: string;
}

export interface ExampleBootstrapSummary {
  dryRun: boolean;
  target: {
    organization: string;
    project: string;
    branch: string;
    revision: string;
  };
  project: ProjectEnsureResult;
  tables: BootstrapResourceSummary;
  rows: BootstrapResourceSummary;
  endpoints: BootstrapResourceSummary<EndpointType>;
  commit: BootstrapCommitSummary;
}

export interface ExampleBootstrapOptions extends TargetOptions {
  configPath: string;
  commit?: boolean;
  dryRun?: boolean;
  endpointOverrides?: EndpointType[];
}

interface ResolvedClient {
  url: RevisiumUrlComplete;
  apiClient: RevisiumApiClient;
}

interface BootstrapTableConfig {
  id: string;
  schema: object;
}

interface BootstrapRowConfig {
  tableId: string;
  rowId: string;
  data: object;
}

interface ExampleBootstrapConfig {
  projectName?: string;
  branchName?: string;
  endpoints: EndpointType[];
  tables: BootstrapTableConfig[];
  rows: BootstrapRowConfig[];
  commitMessage?: string;
}

@Injectable()
export class BootstrapService {
  constructor(private readonly connectionService: ConnectionService) {}

  async ensureProject(
    options: TargetOptions,
    dryRun = false,
  ): Promise<ProjectEnsureResult> {
    const { url, apiClient } = await this.createResolvedClient(options);
    const branchName = url.branch || 'master';
    const orgScope = apiClient.client.org(url.organization);
    const projectScope = orgScope.project(url.project);

    let projectStatus: ProjectEnsureResult['projectStatus'] = 'skipped';
    let branchStatus: ProjectEnsureResult['branchStatus'] = 'skipped';

    try {
      await projectScope.get();
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }

      projectStatus = 'created';
      branchStatus = 'created';
      if (!dryRun) {
        await orgScope.createProject({
          projectName: url.project,
          branchName,
        });
      }

      return {
        organization: url.organization,
        project: url.project,
        branch: branchName,
        projectStatus,
        branchStatus,
        dryRun,
      };
    }

    try {
      await apiClient.client.branch({
        org: url.organization,
        project: url.project,
        branch: branchName,
      });
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }

      branchStatus = 'created';
      if (!dryRun) {
        const rootBranch = await projectScope.branch();
        await projectScope.createBranch(branchName, rootBranch.headRevisionId);
      }
    }

    return {
      organization: url.organization,
      project: url.project,
      branch: branchName,
      projectStatus,
      branchStatus,
      dryRun,
    };
  }

  async ensureEndpoint(
    options: TargetOptions,
    type: EndpointType,
    dryRun = false,
  ): Promise<EndpointEnsureResult> {
    const { url, apiClient } = await this.createResolvedClient(options);
    const revisionScope = await this.resolveRevisionScope(url, apiClient);
    const endpoint = await this.findEndpoint(revisionScope, type);

    if (endpoint) {
      return {
        endpoint,
        status: 'skipped',
        revision: url.revision,
        dryRun,
      };
    }

    if (dryRun) {
      return {
        endpoint: { type },
        status: 'created',
        revision: url.revision,
        dryRun,
      };
    }

    return {
      endpoint: await revisionScope.createEndpoint({ type }),
      status: 'created',
      revision: url.revision,
      dryRun,
    };
  }

  async listEndpoints(options: TargetOptions): Promise<EndpointModel[]> {
    const { url, apiClient } = await this.createResolvedClient(options);
    const revisionScope = await this.resolveRevisionScope(url, apiClient);
    return revisionScope.getEndpoints();
  }

  async bootstrapExample(
    options: ExampleBootstrapOptions,
  ): Promise<ExampleBootstrapSummary> {
    const config = await this.loadBootstrapConfig(options.configPath);
    const { url, apiClient } = await this.createResolvedClient(options);
    this.assertConfigMatchesTarget(config, url);
    this.assertWritableRevision(url);

    const dryRun = Boolean(options.dryRun);
    const endpoints =
      options.endpointOverrides && options.endpointOverrides.length > 0
        ? this.uniqueEndpoints(options.endpointOverrides)
        : config.endpoints;

    const project = await this.ensureProject(options, dryRun);
    const emptySummary = this.createEmptySummary(url, project, dryRun);

    if (dryRun && project.projectStatus === 'created') {
      emptySummary.tables.created = config.tables.map((table) => table.id);
      emptySummary.rows.created = config.rows.map((row) =>
        this.formatRowId(row.tableId, row.rowId),
      );
      emptySummary.endpoints.created = endpoints;
      emptySummary.commit = this.buildSkippedCommitSummary(
        options.commit,
        config.commitMessage,
        dryRun,
        this.countCreated(emptySummary),
      );
      return emptySummary;
    }

    const revisionScope = await this.resolveDiffRevisionScope(
      url,
      apiClient,
      project,
      dryRun,
    );

    for (const table of config.tables) {
      await this.ensureTable(revisionScope, table, emptySummary.tables, dryRun);
      this.throwIfConflicts(emptySummary.tables, 'table');
    }

    for (const row of config.rows) {
      await this.ensureRow(revisionScope, row, emptySummary.rows, dryRun);
      this.throwIfConflicts(emptySummary.rows, 'row');
    }

    for (const endpointType of endpoints) {
      await this.ensureEndpointOnRevision(
        revisionScope,
        endpointType,
        emptySummary.endpoints,
        dryRun,
      );
    }

    emptySummary.commit = await this.commitIfRequested(
      revisionScope,
      options.commit,
      config.commitMessage,
      dryRun,
      this.countCreated(emptySummary),
    );

    return emptySummary;
  }

  async loadBootstrapConfig(filePath: string): Promise<ExampleBootstrapConfig> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(await readFile(filePath, 'utf-8'));
    } catch (error) {
      throw new Error(
        `Could not read bootstrap config at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!this.isObject(parsed)) {
      throw new TypeError('Bootstrap config must be a JSON object');
    }

    return {
      projectName: this.optionalString(parsed, 'projectName'),
      branchName: this.optionalString(parsed, 'branchName'),
      endpoints: this.parseEndpointArray(parsed.endpoints, 'endpoints'),
      tables: this.parseTables(parsed.tables),
      rows: this.parseRows(parsed.rows),
      commitMessage: this.optionalString(parsed, 'commitMessage'),
    };
  }

  formatEndpointHint(url: RevisiumUrlComplete, type: EndpointType): string {
    const branch = url.branch || 'master';
    const revision = url.revision || 'draft';
    const target = `${url.organization}/${url.project}/${branch}/${revision}`;

    if (type === 'GRAPHQL') {
      return `${url.baseUrl}/endpoint/graphql/${target}`;
    }

    return `${url.baseUrl}/endpoint/rest/${target}`;
  }

  async resolveTarget(options: TargetOptions): Promise<RevisiumUrlComplete> {
    return this.connectionService.resolveTarget(options);
  }

  parseEndpointType(value: string): EndpointType {
    if (value !== 'REST_API' && value !== 'GRAPHQL') {
      throw new Error('Endpoint type must be REST_API or GRAPHQL');
    }
    return value;
  }

  private async createResolvedClient(
    options: TargetOptions,
  ): Promise<ResolvedClient> {
    const url = await this.connectionService.resolveTarget(options);
    const apiClient = new RevisiumApiClient(url.baseUrl);
    await apiClient.authenticate(url.auth);
    return { url, apiClient };
  }

  private async resolveRevisionScope(
    url: RevisiumUrlComplete,
    apiClient: RevisiumApiClient,
  ): Promise<RevisionScope> {
    return apiClient.client.revision({
      org: url.organization,
      project: url.project,
      branch: url.branch || 'master',
      revision: url.revision || 'draft',
    });
  }

  private async resolveDiffRevisionScope(
    url: RevisiumUrlComplete,
    apiClient: RevisiumApiClient,
    project: ProjectEnsureResult,
    dryRun: boolean,
  ): Promise<RevisionScope> {
    if (dryRun && project.branchStatus === 'created') {
      const projectScope = apiClient.client
        .org(url.organization)
        .project(url.project);
      const rootBranch = await projectScope.branch();
      return apiClient.client.revision({
        org: url.organization,
        project: url.project,
        branch: rootBranch.branchName,
        revision: rootBranch.headRevisionId,
      });
    }
    return this.resolveRevisionScope(url, apiClient);
  }

  private async findEndpoint(
    revisionScope: RevisionScope,
    type: EndpointType,
  ): Promise<EndpointModel | undefined> {
    const endpoints = await revisionScope.getEndpoints();
    return endpoints.find((endpoint) => endpoint.type === type);
  }

  private async ensureTable(
    revisionScope: RevisionScope,
    table: BootstrapTableConfig,
    summary: BootstrapResourceSummary,
    dryRun: boolean,
  ): Promise<void> {
    try {
      const existingSchema = await revisionScope.getTableSchema(table.id);
      if (isDeepStrictEqual(existingSchema, table.schema)) {
        summary.skipped.push(table.id);
        return;
      }
      summary.conflicts.push({
        id: table.id,
        reason: 'existing table schema differs from bootstrap config',
      });
      return;
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }
    }

    summary.created.push(table.id);
    if (!dryRun) {
      await revisionScope.createTable(table.id, table.schema);
    }
  }

  private async ensureRow(
    revisionScope: RevisionScope,
    row: BootstrapRowConfig,
    summary: BootstrapResourceSummary,
    dryRun: boolean,
  ): Promise<void> {
    const id = this.formatRowId(row.tableId, row.rowId);
    const existingRow = await this.findRow(
      revisionScope,
      row.tableId,
      row.rowId,
    );

    if (existingRow) {
      if (isDeepStrictEqual(existingRow.data, row.data)) {
        summary.skipped.push(id);
        return;
      }
      summary.conflicts.push({
        id,
        reason: 'existing row data differs from bootstrap config',
      });
      return;
    }

    summary.created.push(id);
    if (!dryRun) {
      await revisionScope.createRow(row.tableId, row.rowId, row.data);
    }
  }

  private async ensureEndpointOnRevision(
    revisionScope: RevisionScope,
    type: EndpointType,
    summary: BootstrapResourceSummary<EndpointType>,
    dryRun: boolean,
  ): Promise<void> {
    const existing = await this.findEndpoint(revisionScope, type);
    if (existing) {
      summary.skipped.push(type);
      return;
    }

    summary.created.push(type);
    if (!dryRun) {
      await revisionScope.createEndpoint({ type });
    }
  }

  private async findRow(
    revisionScope: RevisionScope,
    tableId: string,
    rowId: string,
  ): Promise<RowModel | undefined> {
    const rows = await revisionScope.getRows(tableId, {
      first: 1,
      where: { id: { equals: rowId } },
    });
    return rows.edges[0]?.node;
  }

  private async commitIfRequested(
    revisionScope: RevisionScope,
    commit: boolean | undefined,
    message: string | undefined,
    dryRun: boolean,
    changeCount: number,
  ): Promise<BootstrapCommitSummary> {
    if (!commit || changeCount === 0) {
      return { status: 'skipped' };
    }

    const commitMessage = message || 'Bootstrap example via revisium-cli';

    if (dryRun) {
      return { status: 'dry-run', message: commitMessage };
    }

    const revision = await revisionScope.commit(commitMessage);
    return {
      status: 'created',
      revisionId: revision.id,
      message: commitMessage,
    };
  }

  private buildSkippedCommitSummary(
    commit: boolean | undefined,
    message: string | undefined,
    dryRun: boolean,
    changeCount: number,
  ): BootstrapCommitSummary {
    if (commit && dryRun && changeCount > 0) {
      return {
        status: 'dry-run',
        message: message || 'Bootstrap example via revisium-cli',
      };
    }
    return { status: 'skipped' };
  }

  private createEmptySummary(
    url: RevisiumUrlComplete,
    project: ProjectEnsureResult,
    dryRun: boolean,
  ): ExampleBootstrapSummary {
    return {
      dryRun,
      target: {
        organization: url.organization,
        project: url.project,
        branch: url.branch || 'master',
        revision: url.revision || 'draft',
      },
      project,
      tables: { created: [], skipped: [], conflicts: [] },
      rows: { created: [], skipped: [], conflicts: [] },
      endpoints: { created: [], skipped: [], conflicts: [] },
      commit: { status: 'skipped' },
    };
  }

  private countCreated(summary: ExampleBootstrapSummary): number {
    return (
      (summary.project.projectStatus === 'created' ? 1 : 0) +
      (summary.project.branchStatus === 'created' ? 1 : 0) +
      summary.tables.created.length +
      summary.rows.created.length +
      summary.endpoints.created.length
    );
  }

  private assertWritableRevision(url: RevisiumUrlComplete): void {
    if (url.revision !== 'draft') {
      throw new Error(
        `Example bootstrap writes tables and rows, so it requires a draft revision. Use ${url.organization}/${url.project}/${url.branch || 'master'}:draft`,
      );
    }
  }

  private assertConfigMatchesTarget(
    config: ExampleBootstrapConfig,
    url: RevisiumUrlComplete,
  ): void {
    if (config.projectName && config.projectName !== url.project) {
      throw new Error(
        `Bootstrap config projectName "${config.projectName}" does not match target project "${url.project}"`,
      );
    }

    const branchName = url.branch || 'master';
    if (config.branchName && config.branchName !== branchName) {
      throw new Error(
        `Bootstrap config branchName "${config.branchName}" does not match target branch "${branchName}"`,
      );
    }
  }

  private throwIfConflicts(
    summary: BootstrapResourceSummary,
    resourceName: string,
  ): void {
    if (summary.conflicts.length === 0) {
      return;
    }

    const conflictList = summary.conflicts
      .map((conflict) => `${conflict.id}: ${conflict.reason}`)
      .join('; ');
    throw new Error(`Bootstrap ${resourceName} conflict: ${conflictList}`);
  }

  private parseEndpointArray(
    value: unknown,
    fieldName: string,
  ): EndpointType[] {
    if (value === undefined) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new TypeError(
        `Bootstrap config field "${fieldName}" must be an array`,
      );
    }
    return this.uniqueEndpoints(
      value.map((entry, index) => {
        if (typeof entry !== 'string') {
          throw new TypeError(
            `Bootstrap config field "${fieldName}[${index}]" must be a string`,
          );
        }
        return this.parseEndpointType(entry);
      }),
    );
  }

  private uniqueEndpoints(values: EndpointType[]): EndpointType[] {
    return Array.from(new Set(values));
  }

  private parseTables(value: unknown): BootstrapTableConfig[] {
    if (value === undefined) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new TypeError('Bootstrap config field "tables" must be an array');
    }
    return value.map((entry, index) => {
      if (!this.isObject(entry)) {
        throw new TypeError(
          `Bootstrap config tables[${index}] must be an object`,
        );
      }
      if (typeof entry.id !== 'string' || entry.id.trim() === '') {
        throw new TypeError(
          `Bootstrap config tables[${index}].id must be a non-empty string`,
        );
      }
      if (!this.isObject(entry.schema)) {
        throw new TypeError(
          `Bootstrap config tables[${index}].schema must be an object`,
        );
      }
      return { id: entry.id, schema: entry.schema };
    });
  }

  private parseRows(value: unknown): BootstrapRowConfig[] {
    if (value === undefined) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new TypeError('Bootstrap config field "rows" must be an array');
    }
    return value.map((entry, index) => {
      if (!this.isObject(entry)) {
        throw new TypeError(
          `Bootstrap config rows[${index}] must be an object`,
        );
      }
      if (typeof entry.tableId !== 'string' || entry.tableId.trim() === '') {
        throw new TypeError(
          `Bootstrap config rows[${index}].tableId must be a non-empty string`,
        );
      }
      if (typeof entry.rowId !== 'string' || entry.rowId.trim() === '') {
        throw new TypeError(
          `Bootstrap config rows[${index}].rowId must be a non-empty string`,
        );
      }
      if (!this.isObject(entry.data)) {
        throw new TypeError(
          `Bootstrap config rows[${index}].data must be an object`,
        );
      }
      return {
        tableId: entry.tableId,
        rowId: entry.rowId,
        data: entry.data,
      };
    });
  }

  private optionalString(
    source: Record<string, unknown>,
    fieldName: string,
  ): string | undefined {
    const value = source[fieldName];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'string') {
      throw new TypeError(
        `Bootstrap config field "${fieldName}" must be a string`,
      );
    }
    return value;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isNotFoundError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('does not exist') ||
      message.includes('not found') ||
      message.includes('Not Found') ||
      message.includes('404')
    );
  }

  private formatRowId(tableId: string, rowId: string): string {
    return `${tableId}/${rowId}`;
  }
}
