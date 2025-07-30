import { Module } from '@nestjs/common';
import { CoreApiService } from 'src/core-api.service';
import { TaskRunner } from 'src/task.command';

@Module({
  imports: [],
  providers: [TaskRunner, CoreApiService],
})
export class AppModule {}
