import { Option } from 'nest-commander';
import { ConfigService } from '@nestjs/config';
import { BaseCommand } from 'src/commands/base.command';
import { SyncApiService, CommitRevisionService } from 'src/services/sync';
import {
  RevisiumUrlComplete,
  UrlBuilderService,
  UrlEnvConfig,
} from 'src/services/url';
import { parseBooleanOption } from 'src/utils/parse-boolean.utils';

export interface BaseSyncOptions {
  source?: string;
  target?: string;
  commit?: boolean;
  dryRun?: boolean;
}

export interface DataSyncOptions extends BaseSyncOptions {
  tables?: string;
  batchSize?: number;
}

export abstract class BaseSyncCommand extends BaseCommand {
  constructor(
    protected readonly configService: ConfigService,
    protected readonly urlBuilder: UrlBuilderService,
    protected readonly syncApi: SyncApiService,
    protected readonly commitRevision: CommitRevisionService,
  ) {
    super();
  }

  protected async connectSourceAndTarget(options: BaseSyncOptions): Promise<{
    sourceUrl: RevisiumUrlComplete;
    targetUrl: RevisiumUrlComplete;
  }> {
    const sourceUrl = await this.urlBuilder.parseAndComplete(
      options.source,
      'source',
      this.getSourceEnv(),
    );

    const targetUrl = await this.urlBuilder.parseAndComplete(
      options.target,
      'target',
      this.getTargetEnv(),
    );

    await this.syncApi.connectSource(sourceUrl);
    await this.syncApi.connectTarget(targetUrl);

    return { sourceUrl, targetUrl };
  }

  protected async commitIfNeeded(
    shouldCommit: boolean | undefined,
    action: string,
    changesCount: number,
  ): Promise<void> {
    if (shouldCommit && changesCount > 0) {
      await this.commitRevision.handleCommitFlowForSync(
        this.syncApi.target,
        action,
        changesCount,
      );
    }
  }

  protected parseTablesList(tables: string | undefined): string[] | undefined {
    if (!tables) {
      return undefined;
    }
    return tables.split(',').map((t) => t.trim());
  }

  private getSourceEnv(): UrlEnvConfig {
    return {
      url: this.configService.get<string>('REVISIUM_SOURCE_URL'),
      token: this.configService.get<string>('REVISIUM_SOURCE_TOKEN'),
      apikey: this.configService.get<string>('REVISIUM_SOURCE_API_KEY'),
      username: this.configService.get<string>('REVISIUM_SOURCE_USERNAME'),
      password: this.configService.get<string>('REVISIUM_SOURCE_PASSWORD'),
    };
  }

  private getTargetEnv(): UrlEnvConfig {
    return {
      url: this.configService.get<string>('REVISIUM_TARGET_URL'),
      token: this.configService.get<string>('REVISIUM_TARGET_TOKEN'),
      apikey: this.configService.get<string>('REVISIUM_TARGET_API_KEY'),
      username: this.configService.get<string>('REVISIUM_TARGET_USERNAME'),
      password: this.configService.get<string>('REVISIUM_TARGET_PASSWORD'),
    };
  }

  @Option({
    flags: '-s, --source [string]',
    description: 'Source URL (revisium://...)',
  })
  parseSource(value: string) {
    return value;
  }

  @Option({
    flags: '-t, --target [string]',
    description: 'Target URL (revisium://...)',
  })
  parseTarget(value: string) {
    return value;
  }

  @Option({
    flags: '-c, --commit [boolean]',
    description: 'Commit changes after sync',
  })
  parseCommit(value?: string): boolean {
    return parseBooleanOption(value);
  }

  @Option({
    flags: '-d, --dry-run [boolean]',
    description: 'Preview changes without applying',
  })
  parseDryRun(value?: string): boolean {
    return parseBooleanOption(value);
  }

  @Option({
    flags: '--tables [string]',
    description: 'Comma-separated list of tables to sync (default: all)',
  })
  parseTables(value: string) {
    return value;
  }

  @Option({
    flags: '--batch-size [number]',
    description: 'Batch size for bulk operations (default: 100)',
  })
  parseBatchSize(value: string) {
    const size = Number.parseInt(value, 10);
    if (Number.isNaN(size) || size < 1) {
      throw new Error('Batch size must be a positive integer');
    }
    return size;
  }
}
