import { Injectable } from '@nestjs/common';
import { ConnectionInfo as SyncConnectionInfo } from './sync-api.service';
import { ConnectionService } from '../connection';
import { LoggerService } from '../common';

export interface CommitResult {
  revisionId: string;
}

interface CommitParams {
  organization: string;
  project: string;
  branch: string;
  api: {
    createRevision: (
      org: string,
      proj: string,
      branch: string,
      data: { comment: string },
    ) => Promise<{ data?: { id: string }; error?: unknown }>;
  };
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
    const connection = this.connectionService.connection;
    return this.doCommit(
      {
        organization: connection.url.organization,
        project: connection.url.project,
        branch: connection.url.branch,
        api: connection.client.api,
      },
      actionDescription,
      changeCount,
    );
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

    await this.doCommit(
      {
        organization: connection.url.organization,
        project: connection.url.project,
        branch: connection.url.branch,
        api: connection.client.api,
      },
      actionDescription,
      changeCount,
    );
  }

  private async doCommit(
    params: CommitParams,
    actionDescription: string,
    changeCount: number,
  ): Promise<CommitResult> {
    this.logger.commit();

    const comment = this.generateCommitComment(actionDescription, changeCount);

    try {
      const result = await params.api.createRevision(
        params.organization,
        params.project,
        params.branch,
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

  private generateCommitComment(
    actionDescription: string,
    changeCount: number,
  ): string {
    const itemWord = changeCount === 1 ? 'item' : 'items';
    return `${actionDescription} ${changeCount} ${itemWord} via revisium-cli`;
  }
}
