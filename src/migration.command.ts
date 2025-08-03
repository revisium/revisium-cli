import { Command, CommandRunner } from 'nest-commander';
import { ApplyMigrationsCommand } from 'src/apply-migration.command';

@Command({
  name: 'migrate',
  subCommands: [ApplyMigrationsCommand],
})
export class MigrationCommand extends CommandRunner {
  constructor() {
    super();
  }

  run(): Promise<void> {
    this.command.help();
  }
}
