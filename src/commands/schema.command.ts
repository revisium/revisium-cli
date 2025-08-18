import { Command, CommandRunner } from 'nest-commander';
import { SaveSchemaCommand } from 'src/commands/save-schema.command';
import { CreateMigrationsCommand } from 'src/commands/create-migrations.command';

@Command({
  name: 'schema',
  subCommands: [SaveSchemaCommand, CreateMigrationsCommand],
})
export class SchemaCommand extends CommandRunner {
  constructor() {
    super();
  }

  run(): Promise<void> {
    this.command.help();
  }
}
