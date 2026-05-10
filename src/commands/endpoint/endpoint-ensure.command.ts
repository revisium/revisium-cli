import { Option, SubCommand } from 'nest-commander';
import { BaseCommand, BaseOptions } from 'src/commands/base.command';
import { BootstrapService, EndpointType } from 'src/services/bootstrap';
import { LoggerService } from 'src/services/common';
import { parseBooleanOption } from 'src/utils/parse-boolean.utils';

type Options = BaseOptions & {
  type: EndpointType;
  dryRun?: boolean;
  json?: boolean;
};

@SubCommand({
  name: 'ensure',
  description: 'Ensure a generated endpoint exists on the selected revision',
})
export class EndpointEnsureCommand extends BaseCommand {
  constructor(
    private readonly bootstrapService: BootstrapService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.type) {
      throw new Error('Error: --type option is required');
    }

    const result = await this.bootstrapService.ensureEndpoint(
      options,
      options.type,
      options.dryRun,
    );
    const target = await this.bootstrapService.resolveTarget(options);
    const endpointId = result.endpoint.id || '<dry-run>';
    const action = result.status === 'created' ? 'Created' : 'Found';
    const hint = this.bootstrapService.formatEndpointHint(target, options.type);

    if (options.json) {
      console.log(JSON.stringify({ ...result, hint }, null, 2));
      return;
    }

    this.logger.success(`${action} endpoint ${endpointId} (${options.type})`);
    this.logger.info(`Revision: ${result.revision}`);
    this.logger.info(`Hint: ${hint}`);
  }

  @Option({
    flags: '--type <type>',
    description: 'Endpoint type: REST_API or GRAPHQL',
    required: true,
  })
  parseType(value: string): EndpointType {
    return this.bootstrapService.parseEndpointType(value);
  }

  @Option({
    flags: '--dry-run [boolean]',
    description: 'Plan changes without writing',
  })
  parseDryRun(value?: string): boolean {
    return parseBooleanOption(value);
  }

  @Option({
    flags: '--json [boolean]',
    description: 'Print machine-readable JSON',
  })
  parseJson(value?: string): boolean {
    return parseBooleanOption(value);
  }
}
