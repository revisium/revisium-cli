import { Injectable } from '@nestjs/common';
import {
  ConnectionFactoryService,
  ConnectionInfo,
} from './connection-factory.service';
import { RevisiumUrlComplete } from './url-builder.service';

export { ConnectionInfo } from './connection-factory.service';

@Injectable()
export class SyncApiService {
  private _source: ConnectionInfo | undefined;
  private _target: ConnectionInfo | undefined;

  constructor(private readonly connectionFactory: ConnectionFactoryService) {}

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
    this._source = await this.connectionFactory.createConnection(url, {
      label: 'source',
    });
  }

  public async connectTarget(url: RevisiumUrlComplete): Promise<void> {
    this.validateTargetRevision(url);

    this._target = await this.connectionFactory.createConnection(url, {
      label: 'target',
    });
  }

  private validateTargetRevision(url: RevisiumUrlComplete): void {
    if (url.revision !== 'draft') {
      throw new Error(
        `Target revision must be "draft", got "${url.revision}". ` +
          `Sync writes to draft revision only.`,
      );
    }
  }
}
