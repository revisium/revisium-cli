import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApplyMigrationsCommand } from 'src/commands/apply-migrations.command';
import { CreateMigrationsCommand } from 'src/commands/create-migrations.command';
import { MigrationCommand } from 'src/commands/migration.command';
import { RowsCommand } from 'src/commands/rows.command';
import { SaveMigrationsCommand } from 'src/commands/save-migrations.command';
import { SaveRowsCommand } from 'src/commands/save-rows.command';
import { SaveSchemaCommand } from 'src/commands/save-schema.command';
import { SchemaCommand } from 'src/commands/schema.command';
import { SyncCommand } from 'src/commands/sync.command';
import { SyncSchemaCommand } from 'src/commands/sync-schema.command';
import { SyncDataCommand } from 'src/commands/sync-data.command';
import { SyncAllCommand } from 'src/commands/sync-all.command';
import { UploadRowsCommand } from 'src/commands/upload-rows.command';
import { CommitRevisionService } from 'src/services/commit-revision.service';
import { ConnectionFactoryService } from 'src/services/connection-factory.service';
import { ConnectionService } from 'src/services/connection.service';
import { FileRowLoaderService } from 'src/services/file-row-loader.service';
import { InteractiveService } from 'src/services/interactive.service';
import { JsonValidatorService } from 'src/services/json-validator.service';
import { LoggerService } from 'src/services/logger.service';
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
  ],
})
export class AppModule {}
