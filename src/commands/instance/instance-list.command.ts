import { CommandRunner, SubCommand } from 'nest-commander';
import { LoggerService } from 'src/services/common';
import { WorkspaceConfigService } from 'src/services/workspace';

@SubCommand({
  name: 'list',
  description: 'List workspace Revisium instances',
})
export class InstanceListCommand extends CommandRunner {
  constructor(
    private readonly workspaceConfig: WorkspaceConfigService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(): Promise<void> {
    const loaded = await this.workspaceConfig.load();
    if (!loaded || Object.keys(loaded.config.instances).length === 0) {
      this.logger.info('No Revisium instances configured in this workspace.');
      return;
    }

    this.logger.info(`Config: ${loaded.path}`);
    for (const [name, instance] of Object.entries(loaded.config.instances)) {
      this.logger.info(
        `${name}\t${instance.baseUrl}\tauth:${instance.authMode || 'stored'}`,
      );
    }
  }
}
