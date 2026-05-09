import { Command, CommandRunner } from 'nest-commander';
import { ProjectEnsureCommand } from './project-ensure.command';

@Command({
  name: 'project',
  description: 'Manage Revisium projects',
  subCommands: [ProjectEnsureCommand],
})
export class ProjectCommand extends CommandRunner {
  constructor() {
    super();
  }

  run(): Promise<void> {
    this.command.help();
    return Promise.resolve();
  }
}
