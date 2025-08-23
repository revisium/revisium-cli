import { Injectable } from '@nestjs/common';
import { CoreApiService } from './core-api.service';
import { ResolveOptionsService } from './resolve-options.service';

interface CommitOptions {
  organization?: string;
  project?: string;
  branch?: string;
}

export interface CommitResult {
  revisionId: string;
}

@Injectable()
export class CommitRevisionService {
  constructor(
    private readonly coreApiService: CoreApiService,
    private readonly resolveOptionsService: ResolveOptionsService,
  ) {}

  async commitChanges(
    options: CommitOptions,
    actionDescription: string,
    changeCount: number,
  ): Promise<CommitResult> {
    console.log('💾 Creating revision...');

    const { organization, project, branch } =
      this.resolveOptionsService.resolve(options);

    const comment = this.generateCommitComment(actionDescription, changeCount);

    try {
      const result = await this.coreApiService.api.createRevision(
        organization,
        project,
        branch,
        {
          comment,
        },
      );

      if (result.data) {
        console.log(`✅ Created revision: ${result.data.id}`);
        return { revisionId: result.data.id };
      } else {
        console.error('❌ Failed to create revision: No data returned');
        throw new Error('Failed to create revision');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to create revision: ${errorMessage}`);
      throw error;
    }
  }

  async handleCommitFlow(
    options: CommitOptions & { commit?: boolean },
    actionDescription: string,
    changeCount: number,
  ): Promise<void> {
    if (changeCount && options.commit) {
      await this.commitChanges(options, actionDescription, changeCount);
    } else if (changeCount && !options.commit) {
      console.log(
        '⚠️  Changes applied to draft. Use --commit to create a revision.',
      );
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
