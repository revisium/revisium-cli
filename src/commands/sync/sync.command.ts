import { Command, CommandRunner } from 'nest-commander';
import { SyncSchemaCommand } from './sync-schema.command';
import { SyncDataCommand } from './sync-data.command';
import { SyncAllCommand } from './sync-all.command';

@Command({
  name: 'sync',
  subCommands: [SyncSchemaCommand, SyncDataCommand, SyncAllCommand],
})
export class SyncCommand extends CommandRunner {
  constructor() {
    super();
  }

  run(): Promise<void> {
    this.command.help();
  }
}
