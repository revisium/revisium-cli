import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RevisionScope } from '@revisium/client';
import {
  ConnectionFactoryService,
  ConnectionInfo,
} from './connection-factory.service';
import { LoggerService } from '../common';
import { RevisiumUrlComplete, UrlBuilderService, UrlEnvConfig } from '../url';
import { LoadedWorkspaceConfig, WorkspaceConfigService } from '../workspace';

export { ConnectionInfo } from './connection-factory.service';

export interface ConnectionOptions {
  url?: string;
  context?: string;
  createProject?: boolean;
}

@Injectable()
export class ConnectionService {
  private _connection: ConnectionInfo | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly urlBuilder: UrlBuilderService,
    private readonly connectionFactory: ConnectionFactoryService,
    private readonly workspaceConfig: WorkspaceConfigService,
    private readonly logger: LoggerService,
  ) {}

  public get connection(): ConnectionInfo {
    if (!this._connection) {
      throw new Error('Connection not established. Call connect() first.');
    }
    return this._connection;
  }

  public get revisionScope(): RevisionScope {
    return this.connection.revisionScope;
  }

  public async connect(options: ConnectionOptions = {}): Promise<void> {
    const env = this.getEnvConfig();
    const url = await this.resolveUrl(options, env);

    this._connection = await this.connectionFactory.createConnection(url, {
      createProject: options.createProject,
    });
  }

  private async resolveUrl(
    options: ConnectionOptions,
    env: UrlEnvConfig,
  ): Promise<RevisiumUrlComplete> {
    if (options.url) {
      return this.urlBuilder.parseAndComplete(options.url, 'api', env);
    }

    if (options.context) {
      const workspace = await this.workspaceConfig.load();
      if (!workspace) {
        throw new Error(
          `No Revisium workspace config found for context "${options.context}". Run: revisium instance add <instance> --url <revisium-server-url>, then revisium context create ${options.context} --instance <instance> --org <org> --project <project>`,
        );
      }
      const url = this.workspaceConfig.resolveConnection(
        workspace,
        options.context,
        env,
      );
      this.logWorkspaceContext(workspace, options.context);
      return url;
    }

    if (env.url) {
      return this.urlBuilder.parseAndComplete(undefined, 'api', env);
    }

    const workspace = await this.workspaceConfig.load();
    if (workspace) {
      const url = this.workspaceConfig.resolveConnection(
        workspace,
        undefined,
        env,
      );
      this.logWorkspaceContext(workspace);
      return url;
    }

    return this.urlBuilder.parseAndComplete(undefined, 'api', env);
  }

  private logWorkspaceContext(
    loaded: LoadedWorkspaceConfig,
    contextName?: string,
  ): void {
    const selectedContext = contextName || loaded.config.currentContext;
    if (!selectedContext) {
      return;
    }

    const context = loaded.config.contexts[selectedContext];
    if (!context) {
      return;
    }

    this.logger.info(
      `Using context ${selectedContext} (instance: ${context.instance})`,
    );
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
}
