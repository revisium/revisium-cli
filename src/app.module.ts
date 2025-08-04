import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoreApiService } from 'src/core-api.service';
import { DraftRevisionService } from 'src/draft-revision.service';
import { JsonValidatorService } from 'src/json-validator.service';
import { ApplyMigrationsCommand } from 'src/apply-migrations.command';
import { MigrationCommand } from 'src/migration.command';
import { SaveMigrationsCommand } from 'src/save-migrations.command';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [
    MigrationCommand,
    ApplyMigrationsCommand,
    SaveMigrationsCommand,
    JsonValidatorService,
    CoreApiService,
    DraftRevisionService,
  ],
})
export class AppModule {}
