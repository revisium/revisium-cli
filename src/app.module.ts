import { Module } from '@nestjs/common';
import { CoreApiService } from 'src/core-api.service';
import { JsonValidatorService } from 'src/json-validator.service';
import { ApplyMigrationsCommand } from 'src/apply-migration.command';

@Module({
  imports: [],
  providers: [ApplyMigrationsCommand, JsonValidatorService, CoreApiService],
})
export class AppModule {}
