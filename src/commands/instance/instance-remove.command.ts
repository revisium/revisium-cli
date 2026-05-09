import { CommandRunner, SubCommand } from 'nest-commander';
import { LoggerService } from 'src/services/common';
import { WorkspaceConfigService } from 'src/services/workspace';

@SubCommand({
  name: 'remove',
  arguments: '<name>',
  description: 'Remove a workspace Revisium instance',
})
export class InstanceRemoveCommand extends CommandRunner {
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
    if (!loaded || !Object.hasOwn(loaded.config.instances, name)) {
      throw new Error(`Revisium instance "${name}" was not found`);
    }

    const usedByContexts = Object.entries(loaded.config.contexts)
      .filter(([, context]) => context.instance === name)
      .map(([contextName]) => contextName);

    if (usedByContexts.length > 0) {
      throw new Error(
        `Cannot remove instance "${name}" because it is used by contexts: ${usedByContexts.join(', ')}`,
      );
    }

    delete loaded.config.instances[name];
    await this.workspaceConfig.save(loaded.path, loaded.config);

    this.logger.success(`Removed instance "${name}"`);
  }
}
