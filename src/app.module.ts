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
import { UploadRowsCommand } from 'src/commands/upload-rows.command';
import { ValidatePatchesCommand } from 'src/commands/validate-patches.command';
import { CommitRevisionService } from 'src/services/commit-revision.service';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';
import { JsonValidatorService } from 'src/services/json-validator.service';
import { PatchGeneratorService } from 'src/services/patch-generator.service';
import { PatchLoaderService } from 'src/services/patch-loader.service';
import { PatchValidationService } from 'src/services/patch-validation.service';
import { ResolveOptionsService } from 'src/services/resolve-options.service';
import { TableDependencyService } from 'src/services/table-dependency.service';
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
    TableDependencyService,
    JsonValidatorService,
    CoreApiService,
    CommitRevisionService,
    DraftRevisionService,
    ResolveOptionsService,
    PatchLoaderService,
    PatchValidationService,
    PatchGeneratorService,
  ],
})
export class AppModule {}
