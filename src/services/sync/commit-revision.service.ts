import { Injectable } from '@nestjs/common';
import { RevisionScope } from '@revisium/client';
import { ConnectionInfo as SyncConnectionInfo } from './sync-api.service';
import { ConnectionService } from '../connection';
import { LoggerService } from '../common';

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
    const connection = this.connectionService.connection;
    return this.doCommit(
      connection.revisionScope,
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
      connection.revisionScope,
      actionDescription,
      changeCount,
    );
  }

  private async doCommit(
    revisionScope: RevisionScope,
    actionDescription: string,
    changeCount: number,
  ): Promise<CommitResult> {
    this.logger.commit();

    const comment = this.generateCommitComment(actionDescription, changeCount);

    try {
      const revision = await revisionScope.commit(comment);
      this.logger.commitSuccess(revision.id);
      return { revisionId: revision.id };
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
