import { Command, CommandRunner } from 'nest-commander';
import { InstanceAddCommand } from './instance-add.command';
import { InstanceListCommand } from './instance-list.command';
import { InstanceRemoveCommand } from './instance-remove.command';
import { InstanceShowCommand } from './instance-show.command';

@Command({
  name: 'instance',
  description: 'Manage workspace Revisium instances',
  subCommands: [
    InstanceAddCommand,
    InstanceListCommand,
    InstanceShowCommand,
    InstanceRemoveCommand,
  ],
})
export class InstanceCommand extends CommandRunner {
  constructor() {
    super();
  }

  run(): Promise<void> {
    this.command.help();
    return Promise.resolve();
  }
}
