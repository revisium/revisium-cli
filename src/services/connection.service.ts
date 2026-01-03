import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api, RequestParams } from 'src/__generated__/api';
import {
  AuthCredentials,
  RevisiumUrlComplete,
  UrlBuilderService,
  UrlEnvConfig,
} from './url-builder.service';

class RevisiumApiClient extends Api<unknown> {
  public authToken: string | undefined = undefined;

  private _bulkCreateSupported: boolean | undefined = undefined;
  private _bulkUpdateSupported: boolean | undefined = undefined;
  private _bulkPatchSupported: boolean | undefined = undefined;

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

  public get bulkPatchSupported(): boolean | undefined {
    return this._bulkPatchSupported;
  }

  public set bulkPatchSupported(value: boolean) {
    this._bulkPatchSupported = value;
  }

  constructor(baseUrl: string) {
    super({ baseUrl });
  }

  public async authenticate(auth: AuthCredentials): Promise<string> {
    if (auth.method === 'token') {
      this.authToken = auth.token;
      const meResponse = await this.api.me();
      if (meResponse.error) {
        throw new Error(
          `Token validation failed: ${JSON.stringify(meResponse.error)}`,
        );
      }
      return meResponse.data.username || 'authenticated user';
    }

    if (auth.method === 'apikey') {
      this.authToken = auth.apikey;
      const meResponse = await this.api.me();
      if (meResponse.error) {
        throw new Error(
          `API key validation failed: ${JSON.stringify(meResponse.error)}`,
        );
      }
      return meResponse.data.username || 'authenticated user';
    }

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

    params.headers ??= {};

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

export interface ConnectionOptions {
  url?: string;
}

@Injectable()
export class ConnectionService {
  private _connection: ConnectionInfo | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly urlBuilder: UrlBuilderService,
  ) {}

  public get connection(): ConnectionInfo {
    if (!this._connection) {
      throw new Error('Connection not established. Call connect() first.');
    }
    return this._connection;
  }

  public get api() {
    return this.connection.client.api;
  }

  public get revisionId(): string {
    return this.connection.revisionId;
  }

  public get draftRevisionId(): string {
    return this.connection.draftRevisionId;
  }

  public get headRevisionId(): string {
    return this.connection.headRevisionId;
  }

  public get bulkCreateSupported(): boolean | undefined {
    return this.connection.client.bulkCreateSupported;
  }

  public set bulkCreateSupported(value: boolean) {
    this.connection.client.bulkCreateSupported = value;
  }

  public get bulkUpdateSupported(): boolean | undefined {
    return this.connection.client.bulkUpdateSupported;
  }

  public set bulkUpdateSupported(value: boolean) {
    this.connection.client.bulkUpdateSupported = value;
  }

  public get bulkPatchSupported(): boolean | undefined {
    return this.connection.client.bulkPatchSupported;
  }

  public set bulkPatchSupported(value: boolean) {
    this.connection.client.bulkPatchSupported = value;
  }

  public async connect(options: ConnectionOptions = {}): Promise<void> {
    const env = this.getEnvConfig();
    const url = await this.urlBuilder.parseAndComplete(options.url, 'api', env);

    this._connection = await this.establishConnection(url);
  }

  private getEnvConfig(): UrlEnvConfig {
    return {
      url: this.configService.get<string>('REVISIUM_URL'),
      token: this.configService.get<string>('REVISIUM_TOKEN'),
      apikey: this.configService.get<string>('REVISIUM_API_KEY'),
      username: this.configService.get<string>('REVISIUM_USERNAME'),
      password: this.configService.get<string>('REVISIUM_PASSWORD'),
    };
  }

  private async establishConnection(
    url: RevisiumUrlComplete,
  ): Promise<ConnectionInfo> {
    const revisiumUrl = this.urlBuilder.formatAsRevisiumUrl(url);
    console.log(`\nConnecting to: ${revisiumUrl}`);

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
