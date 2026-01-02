import { Command, CommandRunner } from 'nest-commander';
import { SyncSchemaCommand } from 'src/commands/sync-schema.command';
import { SyncDataCommand } from 'src/commands/sync-data.command';
import { SyncAllCommand } from 'src/commands/sync-all.command';

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
