import { Command, CommandRunner } from 'nest-commander';
import { ApplyMigrationsCommand } from './apply-migrations.command';
import { SaveMigrationsCommand } from './save-migrations.command';

@Command({
  name: 'migrate',
  subCommands: [ApplyMigrationsCommand, SaveMigrationsCommand],
})
export class MigrationCommand extends CommandRunner {
  constructor() {
    super();
  }

  run(): Promise<void> {
    this.command.help();
  }
}
