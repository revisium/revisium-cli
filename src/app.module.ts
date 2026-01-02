import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApplyMigrationsCommand } from 'src/commands/apply-migrations.command';
import { CreateMigrationsCommand } from 'src/commands/create-migrations.command';
import { MigrationCommand } from 'src/commands/migration.command';
import { PatchesCommand } from 'src/commands/patches.command';
import { RowsCommand } from 'src/commands/rows.command';
import { SaveMigrationsCommand } from 'src/commands/save-migrations.command';
import { SavePatchesCommand } from 'src/commands/save-patches.command';
import { SaveRowsCommand } from 'src/commands/save-rows.command';
import { SaveSchemaCommand } from 'src/commands/save-schema.command';
import { SchemaCommand } from 'src/commands/schema.command';
import { SyncCommand } from 'src/commands/sync.command';
import { SyncSchemaCommand } from 'src/commands/sync-schema.command';
import { SyncDataCommand } from 'src/commands/sync-data.command';
import { SyncAllCommand } from 'src/commands/sync-all.command';
import { UploadRowsCommand } from 'src/commands/upload-rows.command';
import { ValidatePatchesCommand } from 'src/commands/validate-patches.command';
import { PreviewPatchesCommand } from 'src/commands/preview-patches.command';
import { ApplyPatchesCommand } from 'src/commands/apply-patches.command';
import { CommitRevisionService } from 'src/services/commit-revision.service';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';
import { InteractiveService } from 'src/services/interactive.service';
import { JsonValidatorService } from 'src/services/json-validator.service';
import { PatchDiffService } from 'src/services/patch-diff.service';
import { PatchGeneratorService } from 'src/services/patch-generator.service';
import { PatchLoaderService } from 'src/services/patch-loader.service';
import { PatchValidationService } from 'src/services/patch-validation.service';
import { ResolveOptionsService } from 'src/services/resolve-options.service';
import { SyncApiService } from 'src/services/sync-api.service';
import { SyncSchemaService } from 'src/services/sync-schema.service';
import { SyncDataService } from 'src/services/sync-data.service';
import { RowSyncService } from 'src/services/row-sync.service';
import { TableDependencyService } from 'src/services/table-dependency.service';
import { UrlBuilderService } from 'src/services/url-builder.service';
import {
  getEnvFilePath,
  shouldIgnoreEnvFile,
} from 'src/utils/env-config.utils';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvFilePath(),
      ignoreEnvFile: shouldIgnoreEnvFile(),
    }),
  ],
  providers: [
    MigrationCommand,
    ApplyMigrationsCommand,
    SaveMigrationsCommand,
    SchemaCommand,
    SaveSchemaCommand,
    CreateMigrationsCommand,
    RowsCommand,
    SaveRowsCommand,
    UploadRowsCommand,
    PatchesCommand,
    SavePatchesCommand,
    ValidatePatchesCommand,
    PreviewPatchesCommand,
    ApplyPatchesCommand,
    SyncCommand,
    SyncSchemaCommand,
    SyncDataCommand,
    SyncAllCommand,
    TableDependencyService,
    JsonValidatorService,
    CoreApiService,
    CommitRevisionService,
    DraftRevisionService,
    InteractiveService,
    ResolveOptionsService,
    SyncApiService,
    SyncSchemaService,
    SyncDataService,
    RowSyncService,
    UrlBuilderService,
    PatchLoaderService,
    PatchValidationService,
    PatchGeneratorService,
    PatchDiffService,
  ],
})
export class AppModule {}
