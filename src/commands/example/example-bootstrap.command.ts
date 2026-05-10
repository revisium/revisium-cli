import { Option, SubCommand } from 'nest-commander';
import { BaseCommand, BaseOptions } from 'src/commands/base.command';
import {
  BootstrapResourceSummary,
  BootstrapService,
  EndpointType,
  ExampleBootstrapSummary,
} from 'src/services/bootstrap';
import { LoggerService } from 'src/services/common';
import { parseBooleanOption } from 'src/utils/parse-boolean.utils';

type Options = BaseOptions & {
  config: string;
  commit?: boolean;
  dryRun?: boolean;
  json?: boolean;
  endpoint?: EndpointType[];
};

@SubCommand({
  name: 'bootstrap',
  description: 'Bootstrap an example project from a config file',
})
export class ExampleBootstrapCommand extends BaseCommand {
  constructor(
    private readonly bootstrapService: BootstrapService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.config) {
      throw new Error('Error: --config option is required');
    }

    const summary = await this.bootstrapService.bootstrapExample({
      url: options.url,
      context: options.context,
      token: options.token,
      skipAuth: options.skipAuth,
      configPath: options.config,
      commit: options.commit,
      dryRun: options.dryRun,
      endpointOverrides: options.endpoint,
    });

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    this.printSummary(summary);
  }

  private printSummary(summary: ExampleBootstrapSummary): void {
    const mode = summary.dryRun ? 'Dry run: ' : '';
    this.logger.summary(
      `${mode}Bootstrap ${summary.target.organization}/${summary.target.project}/${summary.target.branch}:${summary.target.revision}`,
    );
    this.logger.info(
      `Project: ${summary.project.projectStatus}, branch: ${summary.project.branchStatus}`,
    );
    this.logger.info(this.formatSummary('Tables', summary.tables));
    this.logger.info(this.formatSummary('Rows', summary.rows));
    this.logger.info(this.formatSummary('Endpoints', summary.endpoints));
    this.logger.info(`Commit: ${summary.commit.status}`);
    if (summary.commit.revisionId) {
      this.logger.info(`Revision: ${summary.commit.revisionId}`);
    }
  }

  private formatSummary<T extends string>(
    label: string,
    summary: BootstrapResourceSummary<T>,
  ): string {
    return `${label}: created ${summary.created.length}, skipped ${summary.skipped.length}, conflicts ${summary.conflicts.length}`;
  }

  @Option({
    flags: '--config <path>',
    description: 'Bootstrap config JSON file',
    required: true,
  })
  parseConfig(value: string): string {
    return value;
  }

  @Option({
    flags: '-c, --commit [boolean]',
    description: 'Create a revision after bootstrap changes',
  })
  parseCommit(value?: string): boolean {
    return parseBooleanOption(value);
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

  @Option({
    flags: '--endpoint <type>',
    description:
      'Endpoint type override. Repeat for multiple values. Replaces config endpoints when provided.',
  })
  parseEndpoint(value: string, previous?: EndpointType[]): EndpointType[] {
    return [
      ...(previous || []),
      this.bootstrapService.parseEndpointType(value),
    ];
  }
}
