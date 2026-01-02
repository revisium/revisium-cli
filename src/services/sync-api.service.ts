import { Injectable } from '@nestjs/common';
import { Api, RequestParams } from 'src/__generated__/api';
import {
  AuthCredentials,
  RevisiumUrlComplete,
  UrlBuilderService,
} from './url-builder.service';

class RevisiumApiClient extends Api<unknown> {
  public authToken: string | undefined = undefined;

  private _bulkCreateSupported: boolean | undefined = undefined;
  private _bulkUpdateSupported: boolean | undefined = undefined;

  public get bulkCreateSupported(): boolean | undefined {
    return this._bulkCreateSupported;
  }

  public set bulkCreateSupported(value: boolean) {
    this._bulkCreateSupported = value;
  }

  public get bulkUpdateSupported(): boolean | undefined {
    return this._bulkUpdateSupported;
  }

  public set bulkUpdateSupported(value: boolean) {
    this._bulkUpdateSupported = value;
  }

  constructor(baseUrl: string) {
    super({ baseUrl });
  }

  public async authenticate(auth: AuthCredentials): Promise<string> {
    if (auth.method === 'token') {
      this.authToken = auth.token;
      // Validate token by calling /me endpoint
      const meResponse = await this.api.me();
      if (meResponse.error) {
        throw new Error(
          `Token validation failed: ${JSON.stringify(meResponse.error)}`,
        );
      }
      return meResponse.data.username || 'authenticated user';
    }

    if (auth.method === 'apikey') {
      // API key auth - future implementation
      this.authToken = auth.apikey;
      const meResponse = await this.api.me();
      if (meResponse.error) {
        throw new Error(
          `API key validation failed: ${JSON.stringify(meResponse.error)}`,
        );
      }
      return meResponse.data.username || 'authenticated user';
    }

    // Password auth
    const response = await this.api.login({
      emailOrUsername: auth.username!,
      password: auth.password!,
    });

    if (response.error) {
      throw new Error(`Login failed: ${JSON.stringify(response.error)}`);
    }

    this.authToken = response.data.accessToken;
    return auth.username!;
  }

  protected mergeRequestParams(
    params1: RequestParams,
    params2?: RequestParams,
  ): RequestParams {
    const params = super.mergeRequestParams(params1, params2);

    if (!params.headers) {
      params.headers = {};
    }

    if (this.authToken) {
      (params.headers as Record<string, string>)['Authorization'] =
        `Bearer ${this.authToken}`;
    }

    return params;
  }
}

export interface ConnectionInfo {
  url: RevisiumUrlComplete;
  client: RevisiumApiClient;
  revisionId: string;
  headRevisionId: string;
  draftRevisionId: string;
}

@Injectable()
export class SyncApiService {
  private _source: ConnectionInfo | undefined;
  private _target: ConnectionInfo | undefined;

  constructor(private readonly urlBuilder: UrlBuilderService) {}

  public get source(): ConnectionInfo {
    if (!this._source) {
      throw new Error('Source connection not established');
    }
    return this._source;
  }

  public get target(): ConnectionInfo {
    if (!this._target) {
      throw new Error('Target connection not established');
    }
    return this._target;
  }

  public async connectSource(url: RevisiumUrlComplete): Promise<void> {
    this._source = await this.connect(url, 'source');
  }

  public async connectTarget(url: RevisiumUrlComplete): Promise<void> {
    if (url.revision !== 'draft') {
      throw new Error(
        `Target revision must be "draft", got "${url.revision}". ` +
          `Sync writes to draft revision only.`,
      );
    }
    this._target = await this.connect(url, 'target');
  }

  private async connect(
    url: RevisiumUrlComplete,
    label: string,
  ): Promise<ConnectionInfo> {
    const revisiumUrl = this.urlBuilder.formatAsRevisiumUrl(url);
    console.log(`\nConnecting to ${label}: ${revisiumUrl}`);

    const client = new RevisiumApiClient(url.baseUrl);
    const username = await client.authenticate(url.auth);

    console.log(`  ✓ Authenticated as ${username}`);

    const projectResponse = await client.api.project(
      url.organization,
      url.project,
    );

    if (projectResponse.error) {
      throw new Error(
        `Failed to get project: ${JSON.stringify(projectResponse.error)}`,
      );
    }

    const branchName = url.branch || 'master';

    const [headResponse, draftResponse] = await Promise.all([
      client.api.headRevision(url.organization, url.project, branchName),
      client.api.draftRevision(url.organization, url.project, branchName),
    ]);

    if (headResponse.error) {
      throw new Error(
        `Failed to get head revision: ${JSON.stringify(headResponse.error)}`,
      );
    }

    if (draftResponse.error) {
      throw new Error(
        `Failed to get draft revision: ${JSON.stringify(draftResponse.error)}`,
      );
    }

    const headRevisionId = headResponse.data.id;
    const draftRevisionId = draftResponse.data.id;

    const revisionId = this.resolveRevisionId(
      url.revision,
      headRevisionId,
      draftRevisionId,
    );

    const revisionLabel = this.getRevisionLabel(
      url.revision,
      revisionId,
      headRevisionId,
      draftRevisionId,
    );

    console.log(
      `  ✓ Project: ${url.organization}/${url.project}, Branch: ${branchName}, Revision: ${revisionLabel}`,
    );

    return {
      url,
      client,
      revisionId,
      headRevisionId,
      draftRevisionId,
    };
  }

  private resolveRevisionId(
    revision: string,
    headRevisionId: string,
    draftRevisionId: string,
  ): string {
    if (revision === 'head') {
      return headRevisionId;
    }
    if (revision === 'draft') {
      return draftRevisionId;
    }
    return revision;
  }

  private getRevisionLabel(
    revision: string,
    revisionId: string,
    headRevisionId: string,
    draftRevisionId: string,
  ): string {
    if (revision === 'head') {
      return 'head';
    }
    if (revision === 'draft') {
      return 'draft';
    }
    if (revisionId === headRevisionId) {
      return `${revisionId} (head)`;
    }
    if (revisionId === draftRevisionId) {
      return `${revisionId} (draft)`;
    }
    return revisionId;
  }
}
