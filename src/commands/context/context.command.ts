import { Command, CommandRunner } from 'nest-commander';
import { ContextCreateCommand } from './context-create.command';
import { ContextListCommand } from './context-list.command';
import { ContextRemoveCommand } from './context-remove.command';
import { ContextShowCommand } from './context-show.command';
import { ContextUseCommand } from './context-use.command';

@Command({
  name: 'context',
  description: 'Manage workspace Revisium contexts',
  subCommands: [
    ContextCreateCommand,
    ContextListCommand,
    ContextShowCommand,
    ContextUseCommand,
    ContextRemoveCommand,
  ],
})
export class ContextCommand extends CommandRunner {
  constructor() {
    super();
  }

  run(): Promise<void> {
    this.command.help();
    return Promise.resolve();
  }
}
