import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { LoggerService } from 'src/services/common';
import { WorkspaceConfigService } from 'src/services/workspace';
import { parseBooleanOption } from 'src/utils/parse-boolean.utils';

interface Options {
  json?: boolean;
}

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

  async run(_inputs: string[], options: Options = {}): Promise<void> {
    const loaded = await this.workspaceConfig.load();
    const entries = loaded ? Object.entries(loaded.config.instances) : [];
    const sorted = [...entries].sort(([a], [b]) => a.localeCompare(b));

    if (options.json) {
      const instances = sorted.map(([name, instance]) => ({
        name,
        baseUrl: instance.baseUrl,
        authMode: instance.authMode || 'stored',
      }));
      console.log(JSON.stringify({ instances }, null, 2));
      return;
    }

    if (sorted.length === 0) {
      this.logger.info('No Revisium instances configured in this workspace.');
      return;
    }

    this.logger.info(`Config: ${loaded?.path}`);
    for (const [name, instance] of sorted) {
      this.logger.info(
        `${name}\t${instance.baseUrl}\tauth:${instance.authMode || 'stored'}`,
      );
    }
  }

  @Option({
    flags: '--json [boolean]',
    description: 'Print machine-readable JSON',
  })
  parseJson(value?: string): boolean {
    return parseBooleanOption(value);
  }
}
