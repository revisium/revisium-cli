import { Command, CommandRunner } from 'nest-commander';
import { ApplyMigrationsCommand } from 'src/commands/apply-migrations.command';
import { SaveMigrationsCommand } from 'src/commands/save-migrations.command';

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
