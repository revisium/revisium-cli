import { CommandRunner, SubCommand } from 'nest-commander';
import { LoggerService } from 'src/services/common';
import { WorkspaceConfigService } from 'src/services/workspace';

@SubCommand({
  name: 'show',
  arguments: '<name>',
  description: 'Show a workspace Revisium instance',
})
export class InstanceShowCommand extends CommandRunner {
  constructor(
    private readonly workspaceConfig: WorkspaceConfigService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(inputs: string[]): Promise<void> {
    const name = inputs[0];
    if (!name) {
      throw new Error('Error: instance name is required');
    }

    const loaded = await this.workspaceConfig.load();
    const instance = loaded?.config.instances[name];
    if (!loaded || !instance) {
      throw new Error(`Revisium instance "${name}" was not found`);
    }

    this.logger.info(`Name: ${name}`);
    this.logger.info(`Base URL: ${instance.baseUrl}`);
    this.logger.info(`Auth mode: ${instance.authMode || 'stored'}`);
    this.logger.info(`Config: ${loaded.path}`);
  }
}
