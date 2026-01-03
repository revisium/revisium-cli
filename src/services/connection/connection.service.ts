import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectionFactoryService,
  ConnectionInfo,
} from './connection-factory.service';
import { UrlBuilderService, UrlEnvConfig } from '../url';

export { ConnectionInfo } from './connection-factory.service';

export interface ConnectionOptions {
  url?: string;
}

@Injectable()
export class ConnectionService {
  private _connection: ConnectionInfo | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly urlBuilder: UrlBuilderService,
    private readonly connectionFactory: ConnectionFactoryService,
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

  public async connect(options: ConnectionOptions = {}): Promise<void> {
    const env = this.getEnvConfig();
    const url = await this.urlBuilder.parseAndComplete(options.url, 'api', env);

    this._connection = await this.connectionFactory.createConnection(url);
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
