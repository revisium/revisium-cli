import { CommandRunner, SubCommand } from 'nest-commander';
import { LoggerService } from 'src/services/common';
import {
  DEFAULT_BRANCH,
  DEFAULT_CREDENTIAL,
  DEFAULT_REVISION,
  WorkspaceConfigService,
} from 'src/services/workspace';

@SubCommand({
  name: 'show',
  arguments: '[name]',
  description: 'Show a workspace Revisium context',
})
export class ContextShowCommand extends CommandRunner {
  constructor(
    private readonly workspaceConfig: WorkspaceConfigService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(inputs: string[]): Promise<void> {
    const loaded = await this.workspaceConfig.load();
    if (!loaded) {
      throw new Error('No Revisium workspace config found');
    }

    const name = inputs[0] || loaded.config.currentContext;
    if (!name) {
      throw new Error('No current Revisium context is configured');
    }

    const context = loaded.config.contexts[name];
    if (!context) {
      throw new Error(`Revisium context "${name}" was not found`);
    }

    const instance = loaded.config.instances[context.instance];

    this.logger.info(`Name: ${name}`);
    this.logger.info(`Instance: ${context.instance}`);
    if (instance) {
      this.logger.info(`Base URL: ${instance.baseUrl}`);
      this.logger.info(`Auth mode: ${instance.authMode || 'stored'}`);
    } else {
      this.logger.warn(`Instance "${context.instance}" not found in config`);
    }
    this.logger.info(
      `Target: ${context.organization}/${context.project}/${context.branch || DEFAULT_BRANCH}:${context.revision || DEFAULT_REVISION}`,
    );
    if ((instance?.authMode || 'stored') === 'stored') {
      this.logger.info(
        `Credential: ${context.credential || DEFAULT_CREDENTIAL}`,
      );
    }
    this.logger.info(`Config: ${loaded.path}`);
  }
}
