import { Module } from '@nestjs/common';
import { TaskRunner } from 'src/task.command';

@Module({
  imports: [],
  providers: [TaskRunner],
})
export class AppModule {}
