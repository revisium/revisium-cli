import { CommandRunner, SubCommand } from 'nest-commander';
import { LoggerService } from 'src/services/common';
import {
  DEFAULT_BRANCH,
  DEFAULT_REVISION,
  WorkspaceConfigService,
} from 'src/services/workspace';

@SubCommand({
  name: 'list',
  description: 'List workspace Revisium contexts',
})
export class ContextListCommand extends CommandRunner {
  constructor(
    private readonly workspaceConfig: WorkspaceConfigService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(): Promise<void> {
    const loaded = await this.workspaceConfig.load();
    if (!loaded || Object.keys(loaded.config.contexts).length === 0) {
      this.logger.info('No Revisium contexts configured in this workspace.');
      return;
    }

    this.logger.info(`Config: ${loaded.path}`);
    for (const [name, context] of Object.entries(loaded.config.contexts)) {
      const marker = loaded.config.currentContext === name ? '*' : ' ';
      this.logger.info(
        `${marker} ${name}\t${context.instance}\t${context.organization}/${context.project}/${context.branch || DEFAULT_BRANCH}:${context.revision || DEFAULT_REVISION}`,
      );
    }
  }
}
