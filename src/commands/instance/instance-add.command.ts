import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { LoggerService } from 'src/services/common';
import {
  WorkspaceAuthMode,
  WorkspaceConfigService,
} from 'src/services/workspace';
import { parseBooleanOption } from 'src/utils/parse-boolean.utils';

interface Options {
  url?: string;
  auth?: WorkspaceAuthMode;
  force?: boolean;
}

@SubCommand({
  name: 'add',
  arguments: '<name>',
  description: 'Add a new workspace Revisium instance',
})
export class InstanceAddCommand extends CommandRunner {
  constructor(
    private readonly workspaceConfig: WorkspaceConfigService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(inputs: string[], options: Options): Promise<void> {
    const name = inputs[0];
    if (!name) {
      throw new Error('Error: instance name is required');
    }
    if (!options.url) {
      throw new Error('Error: --url option is required');
    }

    const loaded = await this.workspaceConfig.loadOrCreate();
    const baseUrl = this.workspaceConfig.normalizeBaseUrl(options.url);
    const authMode = options.auth || 'stored';
    const existed = Boolean(loaded.config.instances[name]);

    if (existed && !options.force) {
      throw new Error(
        `Revisium instance "${name}" already exists. Use --force to overwrite.`,
      );
    }

    loaded.config.instances[name] = {
      baseUrl,
      authMode,
    };

    await this.workspaceConfig.save(loaded.path, loaded.config);

    this.logger.success(
      `${existed ? 'Updated' : 'Added'} instance "${name}" (${baseUrl}, auth: ${authMode})`,
    );
    this.logger.info(`Config: ${loaded.path}`);
  }

  @Option({
    flags: '--url <url>',
    description: 'Revisium server URL, for example revisium://localhost:9222',
    required: true,
  })
  parseUrl(value: string) {
    return value;
  }

  @Option({
    flags: '--auth <mode>',
    description: 'Authentication mode: stored or none',
  })
  parseAuth(value: string): WorkspaceAuthMode {
    if (value !== 'stored' && value !== 'none') {
      throw new Error('Auth mode must be "stored" or "none"');
    }
    return value;
  }

  @Option({
    flags: '--force [boolean]',
    description: 'Overwrite an existing instance entry with the same name',
  })
  parseForce(value?: string): boolean {
    return parseBooleanOption(value);
  }
}
