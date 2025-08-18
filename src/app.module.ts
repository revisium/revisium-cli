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
import { UploadRowsCommand } from 'src/commands/upload-rows.command';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';
import { JsonValidatorService } from 'src/services/json-validator.service';
import { TableDependencyService } from 'src/services/table-dependency.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
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
    TableDependencyService,
    JsonValidatorService,
    CoreApiService,
    DraftRevisionService,
  ],
})
export class AppModule {}
