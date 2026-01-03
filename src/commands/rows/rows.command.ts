import { Command, CommandRunner } from 'nest-commander';
import { SaveRowsCommand } from './save-rows.command';
import { UploadRowsCommand } from './upload-rows.command';

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
