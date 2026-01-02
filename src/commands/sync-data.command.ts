import { Option, SubCommand } from 'nest-commander';
import { ConfigService } from '@nestjs/config';
import { BaseCommand } from 'src/commands/base.command';
import { SyncApiService } from 'src/services/sync-api.service';
import { SyncDataService } from 'src/services/sync-data.service';
import { UrlBuilderService } from 'src/services/url-builder.service';
import { CommitRevisionService } from 'src/services/commit-revision.service';

type Options = {
  source?: string;
  target?: string;
  tables?: string;
  batchSize?: number;
  commit?: boolean;
  dryRun?: boolean;
};

@SubCommand({
  name: 'data',
  description: 'Sync data (rows) from source to target project',
})
export class SyncDataCommand extends BaseCommand {
  constructor(
    private readonly configService: ConfigService,
    private readonly urlBuilder: UrlBuilderService,
    private readonly syncApi: SyncApiService,
    private readonly syncData: SyncDataService,
    private readonly commitRevision: CommitRevisionService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    const sourceEnv = {
      url: this.configService.get<string>('REVISIUM_SOURCE_URL'),
      token: this.configService.get<string>('REVISIUM_SOURCE_TOKEN'),
      apikey: this.configService.get<string>('REVISIUM_SOURCE_API_KEY'),
      username: this.configService.get<string>('REVISIUM_SOURCE_USERNAME'),
      password: this.configService.get<string>('REVISIUM_SOURCE_PASSWORD'),
    };

    const targetEnv = {
      url: this.configService.get<string>('REVISIUM_TARGET_URL'),
      token: this.configService.get<string>('REVISIUM_TARGET_TOKEN'),
      apikey: this.configService.get<string>('REVISIUM_TARGET_API_KEY'),
      username: this.configService.get<string>('REVISIUM_TARGET_USERNAME'),
      password: this.configService.get<string>('REVISIUM_TARGET_PASSWORD'),
    };

    const sourceUrl = await this.urlBuilder.parseAndComplete(
      options.source,
      'source',
      sourceEnv,
    );

    const targetUrl = await this.urlBuilder.parseAndComplete(
      options.target,
      'target',
      targetEnv,
    );

    console.log('\n🔄 Starting data synchronization...\n');

    await this.syncApi.connectSource(sourceUrl);
    await this.syncApi.connectTarget(targetUrl);

    const tables = options.tables
      ? options.tables.split(',').map((t) => t.trim())
      : undefined;

    const result = await this.syncData.sync({
      dryRun: options.dryRun,
      tables,
      batchSize: options.batchSize,
    });

    if (options.dryRun) {
      console.log('\n📋 Dry run complete - no changes were made');
      this.printDataSummary(result);
      return;
    }

    const totalChanges = result.totalRowsCreated + result.totalRowsUpdated;

    if (totalChanges === 0) {
      console.log('\n✅ Data is already in sync - no changes needed');
      return;
    }

    console.log('\n✅ Data sync complete');
    this.printDataSummary(result);

    if (options.commit && totalChanges > 0) {
      await this.commitRevision.handleCommitFlowForSync(
        this.syncApi.target,
        'Synced',
        totalChanges,
      );
    }
  }

  private printDataSummary(result: {
    totalRowsCreated: number;
    totalRowsUpdated: number;
    totalRowsSkipped: number;
    totalErrors: number;
    tables: Array<{
      tableId: string;
      rowsCreated: number;
      rowsUpdated: number;
    }>;
  }) {
    console.log(`   Rows created: ${result.totalRowsCreated}`);
    console.log(`   Rows updated: ${result.totalRowsUpdated}`);
    console.log(`   Rows skipped: ${result.totalRowsSkipped}`);
    if (result.totalErrors > 0) {
      console.log(`   Errors: ${result.totalErrors}`);
    }
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
    return parseInt(value, 10);
  }

  @Option({
    flags: '-c, --commit [boolean]',
    description: 'Commit changes after sync',
  })
  parseCommit(value?: string): boolean {
    return JSON.parse(value ?? 'true') as boolean;
  }

  @Option({
    flags: '-d, --dry-run [boolean]',
    description: 'Preview changes without applying',
  })
  parseDryRun(value?: string): boolean {
    return JSON.parse(value ?? 'true') as boolean;
  }
}
