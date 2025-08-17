import { Command, CommandRunner } from 'nest-commander';
import { SaveRowsCommand } from 'src/save-rows.command';

@Command({
  name: 'rows',
  subCommands: [SaveRowsCommand],
})
export class RowsCommand extends CommandRunner {
  constructor() {
    super();
  }

  run(): Promise<void> {
    this.command.help();
  }
}
