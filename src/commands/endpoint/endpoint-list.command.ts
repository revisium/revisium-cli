import { Option, SubCommand } from 'nest-commander';
import { BaseCommand, BaseOptions } from 'src/commands/base.command';
import { BootstrapService } from 'src/services/bootstrap';
import { LoggerService } from 'src/services/common';
import { parseBooleanOption } from 'src/utils/parse-boolean.utils';

type Options = BaseOptions & {
  json?: boolean;
};

@SubCommand({
  name: 'list',
  description: 'List generated endpoints on the selected revision',
})
export class EndpointListCommand extends BaseCommand {
  constructor(
    private readonly bootstrapService: BootstrapService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    const endpoints = await this.bootstrapService.listEndpoints(options);

    if (options.json) {
      console.log(JSON.stringify({ endpoints }, null, 2));
      return;
    }

    if (endpoints.length === 0) {
      this.logger.info('No generated endpoints found');
      return;
    }

    for (const endpoint of endpoints) {
      this.logger.info(`${endpoint.id}\t${endpoint.type}`);
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
