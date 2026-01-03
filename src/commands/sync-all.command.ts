import { SubCommand } from 'nest-commander';
import { ConfigService } from '@nestjs/config';
import {
  BaseSyncCommand,
  DataSyncOptions,
} from 'src/commands/base-sync.command';
import { SyncApiService } from 'src/services/sync-api.service';
import { SyncSchemaService } from 'src/services/sync-schema.service';
import { SyncDataService } from 'src/services/sync-data.service';
import { UrlBuilderService } from 'src/services/url-builder.service';
import { CommitRevisionService } from 'src/services/commit-revision.service';
import { LoggerService } from 'src/services/logger.service';

type SchemaResult = {
  migrationsApplied: number;
  tablesCreated: string[];
  tablesUpdated: string[];
  tablesRemoved: string[];
};

type DataResult = {
  totalRowsCreated: number;
  totalRowsUpdated: number;
  totalRowsSkipped: number;
  totalErrors: number;
};

@SubCommand({
  name: 'all',
  description: 'Sync both schema and data from source to target project',
})
export class SyncAllCommand extends BaseSyncCommand {
  constructor(
    configService: ConfigService,
    urlBuilder: UrlBuilderService,
    syncApi: SyncApiService,
    commitRevision: CommitRevisionService,
    private readonly syncSchema: SyncSchemaService,
    private readonly syncData: SyncDataService,
    private readonly logger: LoggerService,
  ) {
    super(configService, urlBuilder, syncApi, commitRevision);
  }

  async run(_inputs: string[], options: DataSyncOptions): Promise<void> {
    this.logger.section('🔄 Starting full synchronization...\n');

    await this.connectSourceAndTarget(options);

    const schemaResult = await this.syncSchema.sync(options.dryRun);

    const tables = this.parseTablesList(options.tables);

    const dataResult = await this.syncData.sync({
      dryRun: options.dryRun,
      tables,
      batchSize: options.batchSize,
    });

    if (options.dryRun) {
      this.logger.section('📋 Dry run complete - no changes were made');
      this.printSummary(schemaResult, dataResult);
      return;
    }

    const totalChanges =
      schemaResult.migrationsApplied +
      dataResult.totalRowsCreated +
      dataResult.totalRowsUpdated;

    if (totalChanges === 0) {
      this.logger.section(
        '✅ Everything is already in sync - no changes needed',
      );
      return;
    }

    this.logger.section('✅ Full sync complete');
    this.printSummary(schemaResult, dataResult);

    await this.commitIfNeeded(options.commit, 'Synced', totalChanges);
  }

  private printSummary(
    schemaResult: SchemaResult,
    dataResult: DataResult,
  ): void {
    this.logger.section('📊 Summary:');
    this.logger.info('   Schema:');
    this.logger.info(
      `     Migrations applied: ${schemaResult.migrationsApplied}`,
    );
    if (schemaResult.tablesCreated.length > 0) {
      this.logger.info(
        `     Tables created: ${schemaResult.tablesCreated.join(', ')}`,
      );
    }
    if (schemaResult.tablesUpdated.length > 0) {
      this.logger.info(
        `     Tables updated: ${schemaResult.tablesUpdated.join(', ')}`,
      );
    }
    if (schemaResult.tablesRemoved.length > 0) {
      this.logger.info(
        `     Tables removed: ${schemaResult.tablesRemoved.join(', ')}`,
      );
    }

    this.logger.info('   Data:');
    this.logger.info(`     Rows created: ${dataResult.totalRowsCreated}`);
    this.logger.info(`     Rows updated: ${dataResult.totalRowsUpdated}`);
    this.logger.info(`     Rows skipped: ${dataResult.totalRowsSkipped}`);
    if (dataResult.totalErrors > 0) {
      this.logger.info(`     Errors: ${dataResult.totalErrors}`);
    }
  }
}
