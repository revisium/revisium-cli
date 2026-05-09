import { CommandRunner, SubCommand } from 'nest-commander';
import { LoggerService } from 'src/services/common';
import { WorkspaceConfigService } from 'src/services/workspace';

@SubCommand({
  name: 'use',
  arguments: '<name>',
  description: 'Set the current workspace Revisium context',
})
export class ContextUseCommand extends CommandRunner {
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

    loaded.config.currentContext = name;
    await this.workspaceConfig.save(loaded.path, loaded.config);

    this.logger.success(`Using context "${name}"`);
  }
}
