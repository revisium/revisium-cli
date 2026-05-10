import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { LoggerService } from 'src/services/common';
import {
  DEFAULT_BRANCH,
  DEFAULT_REVISION,
  WorkspaceConfigService,
} from 'src/services/workspace';
import { parseBooleanOption } from 'src/utils/parse-boolean.utils';

interface Options {
  json?: boolean;
}

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

  async run(_inputs: string[], options: Options = {}): Promise<void> {
    const loaded = await this.workspaceConfig.load();
    const entries = loaded ? Object.entries(loaded.config.contexts) : [];
    const sorted = [...entries].sort(([a], [b]) => a.localeCompare(b));

    if (options.json) {
      const contexts = sorted.map(([name, context]) => ({
        name,
        instance: context.instance,
        organization: context.organization,
        project: context.project,
        branch: context.branch || DEFAULT_BRANCH,
        revision: context.revision || DEFAULT_REVISION,
        credential: context.credential,
        current: loaded?.config.currentContext === name,
      }));
      console.log(
        JSON.stringify(
          {
            currentContext: loaded?.config.currentContext,
            contexts,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (sorted.length === 0) {
      this.logger.info('No Revisium contexts configured in this workspace.');
      return;
    }

    this.logger.info(`Config: ${loaded?.path}`);
    for (const [name, context] of sorted) {
      const marker = loaded?.config.currentContext === name ? '*' : ' ';
      this.logger.info(
        `${marker} ${name}\t${context.instance}\t${context.organization}/${context.project}/${context.branch || DEFAULT_BRANCH}:${context.revision || DEFAULT_REVISION}`,
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
