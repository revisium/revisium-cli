import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApplyMigrationsCommand } from 'src/commands/migration/apply-migrations.command';
import { CreateMigrationsCommand } from 'src/commands/schema/create-migrations.command';
import { MigrationCommand } from 'src/commands/migration/migration.command';
import { RowsCommand } from 'src/commands/rows/rows.command';
import { SaveMigrationsCommand } from 'src/commands/migration/save-migrations.command';
import { SaveRowsCommand } from 'src/commands/rows/save-rows.command';
import { SaveSchemaCommand } from 'src/commands/schema/save-schema.command';
import { SchemaCommand } from 'src/commands/schema/schema.command';
import { SyncCommand } from 'src/commands/sync/sync.command';
import { SyncSchemaCommand } from 'src/commands/sync/sync-schema.command';
import { SyncDataCommand } from 'src/commands/sync/sync-data.command';
import { SyncAllCommand } from 'src/commands/sync/sync-all.command';
import { UploadRowsCommand } from 'src/commands/rows/upload-rows.command';
import {
  CommitRevisionService,
  FileRowLoaderService,
  RowSyncService,
  SyncApiService,
  SyncDataService,
  SyncSchemaService,
  TableDependencyService,
} from 'src/services/sync';
import {
  ConnectionFactoryService,
  ConnectionService,
} from 'src/services/connection';
import {
  InteractiveService,
  JsonValidatorService,
  LoggerService,
} from 'src/services/common';
import {
  AuthPromptService,
  UrlBuilderService,
  UrlParserService,
} from 'src/services/url';
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
    SyncCommand,
    SyncSchemaCommand,
    SyncDataCommand,
    SyncAllCommand,
    TableDependencyService,
    JsonValidatorService,
    ConnectionFactoryService,
    ConnectionService,
    CommitRevisionService,
    FileRowLoaderService,
    InteractiveService,
    LoggerService,
    SyncApiService,
    SyncSchemaService,
    SyncDataService,
    RowSyncService,
    UrlBuilderService,
    UrlParserService,
    AuthPromptService,
  ],
})
export class AppModule {}
