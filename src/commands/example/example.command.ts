import { Command, CommandRunner } from 'nest-commander';
import { ExampleBootstrapCommand } from './example-bootstrap.command';

@Command({
  name: 'example',
  description: 'Bootstrap Revisium example projects',
  subCommands: [ExampleBootstrapCommand],
})
export class ExampleCommand extends CommandRunner {
  constructor() {
    super();
  }

  run(): Promise<void> {
    this.command.help();
    return Promise.resolve();
  }
}
