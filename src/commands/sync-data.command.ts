import { SubCommand } from 'nest-commander';
import { ConfigService } from '@nestjs/config';
import {
  BaseSyncCommand,
  DataSyncOptions,
} from 'src/commands/base-sync.command';
import { SyncApiService } from 'src/services/sync-api.service';
import { SyncDataService } from 'src/services/sync-data.service';
import { UrlBuilderService } from 'src/services/url-builder.service';
import { CommitRevisionService } from 'src/services/commit-revision.service';
import { LoggerService } from 'src/services/logger.service';

type DataSyncResult = {
  totalRowsCreated: number;
  totalRowsUpdated: number;
  totalRowsSkipped: number;
  totalErrors: number;
  tables: Array<{
    tableId: string;
    rowsCreated: number;
    rowsUpdated: number;
  }>;
};

@SubCommand({
  name: 'data',
  description: 'Sync data (rows) from source to target project',
})
export class SyncDataCommand extends BaseSyncCommand {
  constructor(
    configService: ConfigService,
    urlBuilder: UrlBuilderService,
    syncApi: SyncApiService,
    commitRevision: CommitRevisionService,
    private readonly syncData: SyncDataService,
    private readonly logger: LoggerService,
  ) {
    super(configService, urlBuilder, syncApi, commitRevision);
  }

  async run(_inputs: string[], options: DataSyncOptions): Promise<void> {
    this.logger.section('🔄 Starting data synchronization...\n');

    await this.connectSourceAndTarget(options);

    const tables = this.parseTablesList(options.tables);

    const result = await this.syncData.sync({
      dryRun: options.dryRun,
      tables,
      batchSize: options.batchSize,
    });

    if (options.dryRun) {
      this.logger.section('📋 Dry run complete - no changes were made');
      this.printDataSummary(result);
      return;
    }

    const totalChanges = result.totalRowsCreated + result.totalRowsUpdated;

    if (totalChanges === 0) {
      this.logger.section('✅ Data is already in sync - no changes needed');
      return;
    }

    this.logger.section('✅ Data sync complete');
    this.printDataSummary(result);

    await this.commitIfNeeded(options.commit, 'Synced', totalChanges);
  }

  private printDataSummary(result: DataSyncResult): void {
    this.logger.info(`   Rows created: ${result.totalRowsCreated}`);
    this.logger.info(`   Rows updated: ${result.totalRowsUpdated}`);
    this.logger.info(`   Rows skipped: ${result.totalRowsSkipped}`);
    if (result.totalErrors > 0) {
      this.logger.info(`   Errors: ${result.totalErrors}`);
    }
  }
}
