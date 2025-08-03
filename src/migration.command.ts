import { Command, CommandRunner } from 'nest-commander';
import { ApplyMigrationsCommand } from 'src/apply-migrations.command';
import { SaveMigrationsCommand } from 'src/save-migrations.command';

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
