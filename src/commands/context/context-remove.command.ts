import { CommandRunner, SubCommand } from 'nest-commander';
import { LoggerService } from 'src/services/common';
import { WorkspaceConfigService } from 'src/services/workspace';

@SubCommand({
  name: 'remove',
  arguments: '<name>',
  description: 'Remove a workspace Revisium context',
})
export class ContextRemoveCommand extends CommandRunner {
  constructor(
    private readonly workspaceConfig: WorkspaceConfigService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(inputs: string[]): Promise<void> {
    const name = inputs[0];
    if (!name) {
      throw new Error('Error: context name is required');
    }

    const { loaded } = await this.workspaceConfig.loadContext(name);

    delete loaded.config.contexts[name];
    if (loaded.config.currentContext === name) {
      delete loaded.config.currentContext;
    }

    await this.workspaceConfig.save(loaded.path, loaded.config);

    this.logger.success(`Removed context "${name}"`);
  }
}
