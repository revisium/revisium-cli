import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { LoggerService } from 'src/services/common';
import { CredentialStoreService } from 'src/services/credentials';
import { WorkspaceConfigService } from 'src/services/workspace';
import { parseBooleanOption } from 'src/utils/parse-boolean.utils';

interface Options {
  withCredentials?: boolean;
}

@SubCommand({
  name: 'remove',
  arguments: '<name>',
  description: 'Remove a workspace Revisium instance',
})
export class InstanceRemoveCommand extends CommandRunner {
  constructor(
    private readonly workspaceConfig: WorkspaceConfigService,
    private readonly credentialStore: CredentialStoreService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(inputs: string[], options: Options = {}): Promise<void> {
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

    const baseUrl = loaded.config.instances[name].baseUrl;
    delete loaded.config.instances[name];
    await this.workspaceConfig.save(loaded.path, loaded.config);

    if (options.withCredentials) {
      // Best-effort: instance is already deleted from workspace config, so a
      // keyring failure here shouldn't make the whole command fail.
      try {
        const removed = this.credentialStore.deleteCredential({
          baseUrl,
          credential: 'default',
        });
        if (removed) {
          this.logger.info(`Removed saved credential for "${name}"`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Instance "${name}" was removed, but the saved credential could not be deleted: ${message}`,
        );
      }
    }

    this.logger.success(`Removed instance "${name}"`);
  }

  @Option({
    flags: '--with-credentials [boolean]',
    description:
      'Also delete the saved "default" API-key credential for this instance from the OS keyring',
  })
  parseWithCredentials(value?: string): boolean {
    return parseBooleanOption(value);
  }
}
