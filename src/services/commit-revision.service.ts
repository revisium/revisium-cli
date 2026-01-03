import { Injectable } from '@nestjs/common';
import { ConnectionInfo as SyncConnectionInfo } from './sync-api.service';
import { ConnectionService } from './connection.service';
import { LoggerService } from './logger.service';

export interface CommitResult {
  revisionId: string;
}

@Injectable()
export class CommitRevisionService {
  constructor(
    private readonly connectionService: ConnectionService,
    private readonly logger: LoggerService,
  ) {}

  async commitChanges(
    actionDescription: string,
    changeCount: number,
  ): Promise<CommitResult> {
    this.logger.commit();

    const connection = this.connectionService.connection;
    const comment = this.generateCommitComment(actionDescription, changeCount);

    try {
      const result = await connection.client.api.createRevision(
        connection.url.organization,
        connection.url.project,
        connection.url.branch,
        { comment },
      );

      if (result.data) {
        this.logger.commitSuccess(result.data.id);
        return { revisionId: result.data.id };
      } else {
        this.logger.commitError('No data returned');
        throw new Error('Failed to create revision');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.commitError(errorMessage);
      throw error;
    }
  }

  async handleCommitFlow(
    commit: boolean | undefined,
    actionDescription: string,
    changeCount: number,
  ): Promise<void> {
    if (changeCount && commit) {
      await this.commitChanges(actionDescription, changeCount);
    } else if (changeCount && !commit) {
      this.logger.warn(
        'Changes applied to draft. Use --commit to create a revision.',
      );
    }
  }

  async handleCommitFlowForSync(
    connection: SyncConnectionInfo,
    actionDescription: string,
    changeCount: number,
  ): Promise<void> {
    if (!changeCount) {
      return;
    }

    this.logger.commit();

    const comment = this.generateCommitComment(actionDescription, changeCount);

    try {
      const result = await connection.client.api.createRevision(
        connection.url.organization,
        connection.url.project,
        connection.url.branch,
        { comment },
      );

      if (result.data) {
        this.logger.commitSuccess(result.data.id);
      } else {
        this.logger.commitError('No data returned');
        throw new Error('Failed to create revision');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.commitError(errorMessage);
      throw error;
    }
  }

  private generateCommitComment(
    actionDescription: string,
    changeCount: number,
  ): string {
    const itemWord = changeCount === 1 ? 'item' : 'items';
    return `${actionDescription} ${changeCount} ${itemWord} via revisium-cli`;
  }
}
