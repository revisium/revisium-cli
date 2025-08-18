import { Command, CommandRunner } from 'nest-commander';
import { SaveRowsCommand } from 'src/save-rows.command';
import { UploadRowsCommand } from 'src/upload-rows.command';

@Command({
  name: 'rows',
  subCommands: [SaveRowsCommand, UploadRowsCommand],
})
export class RowsCommand extends CommandRunner {
  constructor() {
    super();
  }

  run(): Promise<void> {
    this.command.help();
  }
}
