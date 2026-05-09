import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { LoggerService } from 'src/services/common';
import {
  DEFAULT_BRANCH,
  DEFAULT_REVISION,
  WorkspaceConfigService,
  WorkspaceConfig,
  WorkspaceContextConfig,
} from 'src/services/workspace';

interface Options {
  url?: string;
  instance?: string;
  credential?: string;
  org?: string;
  project?: string;
  branch?: string;
  revision?: string;
}

@SubCommand({
  name: 'create',
  arguments: '<name>',
  description: 'Create or update a workspace Revisium context',
})
export class ContextCreateCommand extends CommandRunner {
  constructor(
    private readonly workspaceConfig: WorkspaceConfigService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(inputs: string[], options: Options): Promise<void> {
    const name = inputs[0];
    if (!name) {
      throw new Error('Error: context name is required');
    }

    const loaded = await this.workspaceConfig.loadOrCreate();
    const context = this.buildContext(loaded.config, options);
    const existed = Boolean(loaded.config.contexts[name]);

    loaded.config.contexts[name] = context;
    if (!loaded.config.currentContext) {
      loaded.config.currentContext = name;
    }

    await this.workspaceConfig.save(loaded.path, loaded.config);

    this.logger.success(
      `${existed ? 'Updated' : 'Created'} context "${name}" (${context.organization}/${context.project}/${context.branch || DEFAULT_BRANCH}:${context.revision || DEFAULT_REVISION})`,
    );
    this.logger.info(`Instance: ${context.instance}`);
    this.logger.info(`Config: ${loaded.path}`);
  }

  private buildContext(
    config: WorkspaceConfig,
    options: Options,
  ): WorkspaceContextConfig {
    if (options.url) {
      const parsed = this.workspaceConfig.parseContextUrl(options.url);
      const instanceName =
        options.instance ||
        this.workspaceConfig.findInstanceNameByBaseUrl(config, parsed.baseUrl);

      if (!instanceName || !config.instances[instanceName]) {
        throw new Error(
          `No instance found for ${parsed.baseUrl}. Run: revisium instance add <name> --url ${options.url}`,
        );
      }

      return this.withCredential(
        {
          instance: instanceName,
          organization: parsed.organization,
          project: parsed.project,
          branch: parsed.branch,
          revision: parsed.revision,
        },
        options.credential,
      );
    }

    if (!options.instance || !options.org || !options.project) {
      throw new Error(
        'Error: provide --url, or provide --instance, --org, and --project',
      );
    }

    if (!config.instances[options.instance]) {
      throw new Error(`Revisium instance "${options.instance}" was not found`);
    }

    return this.withCredential(
      {
        instance: options.instance,
        organization: options.org,
        project: options.project,
        branch: options.branch || DEFAULT_BRANCH,
        revision: options.revision || DEFAULT_REVISION,
      },
      options.credential,
    );
  }

  private withCredential(
    context: WorkspaceContextConfig,
    credential: string | undefined,
  ): WorkspaceContextConfig {
    if (credential) {
      return { ...context, credential };
    }
    return context;
  }

  @Option({
    flags: '--url <url>',
    description: 'Revisium target URL: revisium://host/org/project/branch',
  })
  parseUrl(value: string) {
    return value;
  }

  @Option({
    flags: '--instance <name>',
    description: 'Instance name from workspace config',
  })
  parseInstance(value: string) {
    return value;
  }

  @Option({
    flags: '--credential <name>',
    description: 'Named saved credential selector for stored auth',
  })
  parseCredential(value: string) {
    return value;
  }

  @Option({
    flags: '--org <organization>',
    description: 'Organization id',
  })
  parseOrg(value: string) {
    return value;
  }

  @Option({
    flags: '--project <project>',
    description: 'Project name',
  })
  parseProject(value: string) {
    return value;
  }

  @Option({
    flags: '--branch <branch>',
    description: 'Branch name (default: master)',
  })
  parseBranch(value: string) {
    return value;
  }

  @Option({
    flags: '--revision <revision>',
    description: 'Revision target (default: draft)',
  })
  parseRevision(value: string) {
    return value;
  }
}
