import { Command, CommandRunner } from 'nest-commander';
import { SaveSchemaCommand } from './save-schema.command';
import { CreateMigrationsCommand } from './create-migrations.command';

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
