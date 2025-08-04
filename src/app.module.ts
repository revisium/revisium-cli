import { Module } from '@nestjs/common';
import { CoreApiService } from 'src/core-api.service';
import { JsonValidatorService } from 'src/json-validator.service';
import { ApplyMigrationsCommand } from 'src/apply-migrations.command';
import { MigrationCommand } from 'src/migration.command';
import { SaveMigrationsCommand } from 'src/save-migrations.command';

@Module({
  imports: [],
  providers: [
    MigrationCommand,
    ApplyMigrationsCommand,
    SaveMigrationsCommand,
    JsonValidatorService,
    CoreApiService,
  ],
})
export class AppModule {}
