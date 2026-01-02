import { Option, SubCommand } from 'nest-commander';
import { ConfigService } from '@nestjs/config';
import { BaseCommand } from 'src/commands/base.command';
import { SyncApiService } from 'src/services/sync-api.service';
import { SyncSchemaService } from 'src/services/sync-schema.service';
import { SyncDataService } from 'src/services/sync-data.service';
import { UrlBuilderService } from 'src/services/url-builder.service';
import { CommitRevisionService } from 'src/services/commit-revision.service';
import { parseBooleanOption } from 'src/utils/parse-boolean.utils';

type Options = {
  source?: string;
  target?: string;
  tables?: string;
  batchSize?: number;
  commit?: boolean;
  dryRun?: boolean;
};

@SubCommand({
  name: 'all',
  description: 'Sync both schema and data from source to target project',
})
export class SyncAllCommand extends BaseCommand {
  constructor(
    private readonly configService: ConfigService,
    private readonly urlBuilder: UrlBuilderService,
    private readonly syncApi: SyncApiService,
    private readonly syncSchema: SyncSchemaService,
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

    console.log('\n🔄 Starting full synchronization...\n');

    await this.syncApi.connectSource(sourceUrl);
    await this.syncApi.connectTarget(targetUrl);

    const schemaResult = await this.syncSchema.sync(options.dryRun);

    const tables = options.tables
      ? options.tables.split(',').map((t) => t.trim())
      : undefined;

    const dataResult = await this.syncData.sync({
      dryRun: options.dryRun,
      tables,
      batchSize: options.batchSize,
    });

    if (options.dryRun) {
      console.log('\n📋 Dry run complete - no changes were made');
      this.printSummary(schemaResult, dataResult);
      return;
    }

    const totalChanges =
      schemaResult.migrationsApplied +
      dataResult.totalRowsCreated +
      dataResult.totalRowsUpdated;

    if (totalChanges === 0) {
      console.log('\n✅ Everything is already in sync - no changes needed');
      return;
    }

    console.log('\n✅ Full sync complete');
    this.printSummary(schemaResult, dataResult);

    if (options.commit && totalChanges > 0) {
      await this.commitRevision.handleCommitFlowForSync(
        this.syncApi.target,
        'Synced',
        totalChanges,
      );
    }
  }

  private printSummary(
    schemaResult: {
      migrationsApplied: number;
      tablesCreated: string[];
      tablesUpdated: string[];
      tablesRemoved: string[];
    },
    dataResult: {
      totalRowsCreated: number;
      totalRowsUpdated: number;
      totalRowsSkipped: number;
      totalErrors: number;
    },
  ) {
    console.log('\n📊 Summary:');
    console.log('   Schema:');
    console.log(`     Migrations applied: ${schemaResult.migrationsApplied}`);
    if (schemaResult.tablesCreated.length > 0) {
      console.log(
        `     Tables created: ${schemaResult.tablesCreated.join(', ')}`,
      );
    }
    if (schemaResult.tablesUpdated.length > 0) {
      console.log(
        `     Tables updated: ${schemaResult.tablesUpdated.join(', ')}`,
      );
    }
    if (schemaResult.tablesRemoved.length > 0) {
      console.log(
        `     Tables removed: ${schemaResult.tablesRemoved.join(', ')}`,
      );
    }

    console.log('   Data:');
    console.log(`     Rows created: ${dataResult.totalRowsCreated}`);
    console.log(`     Rows updated: ${dataResult.totalRowsUpdated}`);
    console.log(`     Rows skipped: ${dataResult.totalRowsSkipped}`);
    if (dataResult.totalErrors > 0) {
      console.log(`     Errors: ${dataResult.totalErrors}`);
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
    const size = Number.parseInt(value, 10);
    if (Number.isNaN(size) || size < 1) {
      throw new Error('Batch size must be a positive integer');
    }
    return size;
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
}
