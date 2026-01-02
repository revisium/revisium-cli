import { Option, SubCommand } from 'nest-commander';
import { ConfigService } from '@nestjs/config';
import { BaseCommand } from 'src/commands/base.command';
import { SyncApiService } from 'src/services/sync-api.service';
import { SyncSchemaService } from 'src/services/sync-schema.service';
import { UrlBuilderService } from 'src/services/url-builder.service';
import { CommitRevisionService } from 'src/services/commit-revision.service';

type Options = {
  source?: string;
  target?: string;
  commit?: boolean;
  dryRun?: boolean;
};

@SubCommand({
  name: 'schema',
  description: 'Sync schema migrations from source to target project',
})
export class SyncSchemaCommand extends BaseCommand {
  constructor(
    private readonly configService: ConfigService,
    private readonly urlBuilder: UrlBuilderService,
    private readonly syncApi: SyncApiService,
    private readonly syncSchema: SyncSchemaService,
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

    console.log('\n🔄 Starting schema synchronization...\n');

    await this.syncApi.connectSource(sourceUrl);
    await this.syncApi.connectTarget(targetUrl);

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

    if (options.commit) {
      await this.commitRevision.handleCommitFlowForSync(
        this.syncApi.target,
        'Applied',
        result.migrationsApplied,
      );
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
