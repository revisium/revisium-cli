import { SubCommand } from 'nest-commander';
import { ConfigService } from '@nestjs/config';
import {
  BaseSyncCommand,
  BaseSyncOptions,
} from 'src/commands/base-sync.command';
import { SyncApiService } from 'src/services/sync-api.service';
import { SyncSchemaService } from 'src/services/sync-schema.service';
import { UrlBuilderService } from 'src/services/url-builder.service';
import { CommitRevisionService } from 'src/services/commit-revision.service';

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
  ) {
    super(configService, urlBuilder, syncApi, commitRevision);
  }

  async run(_inputs: string[], options: BaseSyncOptions): Promise<void> {
    console.log('\n🔄 Starting schema synchronization...\n');

    await this.connectSourceAndTarget(options);

    const result = await this.syncSchema.sync(options.dryRun);

    if (options.dryRun) {
      console.log('\n📋 Dry run complete - no changes were made');
      return;
    }

    if (result.migrationsApplied === 0) {
      console.log('\n✅ Schema is already in sync - no changes needed');
      return;
    }

    console.log(`\n✅ Schema sync complete`);
    console.log(`   Migrations applied: ${result.migrationsApplied}`);

    if (result.tablesCreated.length > 0) {
      console.log(`   Tables created: ${result.tablesCreated.join(', ')}`);
    }
    if (result.tablesUpdated.length > 0) {
      console.log(`   Tables updated: ${result.tablesUpdated.join(', ')}`);
    }
    if (result.tablesRemoved.length > 0) {
      console.log(`   Tables removed: ${result.tablesRemoved.join(', ')}`);
    }

    await this.commitIfNeeded(
      options.commit,
      'Applied',
      result.migrationsApplied,
    );
  }
}
