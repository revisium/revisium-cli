import { Command, CommandRunner } from 'nest-commander';
import { SaveSchemaCommand } from 'src/commands/save-schema.command';

@Command({
  name: 'schema',
  subCommands: [SaveSchemaCommand],
})
export class SchemaCommand extends CommandRunner {
  constructor() {
    super();
  }

  run(): Promise<void> {
    this.command.help();
  }
}
