import { SubCommand } from 'nest-commander';
import { ConfigService } from '@nestjs/config';
import {
  BaseSyncCommand,
  BaseSyncOptions,
} from 'src/commands/base-sync.command';
import {
  SyncApiService,
  SyncSchemaService,
  CommitRevisionService,
} from 'src/services/sync';
import { UrlBuilderService } from 'src/services/url';
import { LoggerService } from 'src/services/common';

@SubCommand({
  name: 'schema',
  description: 'Sync schema migrations from source to target project',
})
export class SyncSchemaCommand extends BaseSyncCommand {
  constructor(
    configService: ConfigService,
    urlBuilder: UrlBuilderService,
    syncApi: SyncApiService,
    commitRevision: CommitRevisionService,
    private readonly syncSchema: SyncSchemaService,
    private readonly logger: LoggerService,
  ) {
    super(configService, urlBuilder, syncApi, commitRevision);
  }

  async run(_inputs: string[], options: BaseSyncOptions): Promise<void> {
    this.logger.section('🔄 Starting schema synchronization...\n');

    await this.connectSourceAndTarget(options);

    const result = await this.syncSchema.sync(options.dryRun);

    if (options.dryRun) {
      this.logger.section('📋 Dry run complete - no changes were made');
      return;
    }

    if (result.migrationsApplied === 0) {
      this.logger.section('✅ Schema is already in sync - no changes needed');
      return;
    }

    this.logger.section('✅ Schema sync complete');
    this.logger.info(`   Migrations applied: ${result.migrationsApplied}`);

    if (result.tablesCreated.length > 0) {
      this.logger.info(`   Tables created: ${result.tablesCreated.join(', ')}`);
    }
    if (result.tablesUpdated.length > 0) {
      this.logger.info(`   Tables updated: ${result.tablesUpdated.join(', ')}`);
    }
    if (result.tablesRemoved.length > 0) {
      this.logger.info(`   Tables removed: ${result.tablesRemoved.join(', ')}`);
    }

    await this.commitIfNeeded(
      options.commit,
      'Applied',
      result.migrationsApplied,
    );
  }
}
