import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthCommand } from 'src/commands/auth/auth.command';
import { AuthLoginCommand } from 'src/commands/auth/auth-login.command';
import { AuthLogoutCommand } from 'src/commands/auth/auth-logout.command';
import { AuthStatusCommand } from 'src/commands/auth/auth-status.command';
import { ApplyMigrationsCommand } from 'src/commands/migration/apply-migrations.command';
import { ContextCommand } from 'src/commands/context/context.command';
import { ContextCreateCommand } from 'src/commands/context/context-create.command';
import { ContextListCommand } from 'src/commands/context/context-list.command';
import { ContextRemoveCommand } from 'src/commands/context/context-remove.command';
import { ContextShowCommand } from 'src/commands/context/context-show.command';
import { ContextUseCommand } from 'src/commands/context/context-use.command';
import { CreateMigrationsCommand } from 'src/commands/schema/create-migrations.command';
import { InstanceAddCommand } from 'src/commands/instance/instance-add.command';
import { InstanceCommand } from 'src/commands/instance/instance.command';
import { InstanceListCommand } from 'src/commands/instance/instance-list.command';
import { InstanceRemoveCommand } from 'src/commands/instance/instance-remove.command';
import { InstanceShowCommand } from 'src/commands/instance/instance-show.command';
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
import { WorkspaceConfigService } from 'src/services/workspace';
import {
  CredentialStoreService,
  CredentialTargetService,
} from 'src/services/credentials';

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
    AuthCommand,
    AuthLoginCommand,
    AuthStatusCommand,
    AuthLogoutCommand,
    InstanceCommand,
    InstanceAddCommand,
    InstanceListCommand,
    InstanceShowCommand,
    InstanceRemoveCommand,
    ContextCommand,
    ContextCreateCommand,
    ContextListCommand,
    ContextShowCommand,
    ContextUseCommand,
    ContextRemoveCommand,
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
    WorkspaceConfigService,
    CredentialStoreService,
    CredentialTargetService,
  ],
})
export class AppModule {}
