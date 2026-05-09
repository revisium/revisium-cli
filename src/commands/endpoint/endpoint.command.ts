import { Command, CommandRunner } from 'nest-commander';
import { EndpointEnsureCommand } from './endpoint-ensure.command';
import { EndpointListCommand } from './endpoint-list.command';

@Command({
  name: 'endpoint',
  description: 'Manage generated Revisium endpoints',
  subCommands: [EndpointEnsureCommand, EndpointListCommand],
})
export class EndpointCommand extends CommandRunner {
  constructor() {
    super();
  }

  run(): Promise<void> {
    this.command.help();
    return Promise.resolve();
  }
}
