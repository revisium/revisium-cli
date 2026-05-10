import { Option, SubCommand } from 'nest-commander';
import { BaseCommand, BaseOptions } from 'src/commands/base.command';
import { BootstrapService } from 'src/services/bootstrap';
import { LoggerService } from 'src/services/common';
import { parseBooleanOption } from 'src/utils/parse-boolean.utils';

type Options = BaseOptions & {
  dryRun?: boolean;
  json?: boolean;
};

@SubCommand({
  name: 'ensure',
  description: 'Ensure a Revisium project and branch exist',
})
export class ProjectEnsureCommand extends BaseCommand {
  constructor(
    private readonly bootstrapService: BootstrapService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    const result = await this.bootstrapService.ensureProject(
      options,
      options.dryRun,
    );

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const projectMessage =
      result.projectStatus === 'created' ? 'Created project' : 'Project exists';
    const branchMessage =
      result.branchStatus === 'created' ? 'created branch' : 'branch exists';
    const mode = result.dryRun ? 'Dry run: ' : '';

    this.logger.success(
      `${mode}${projectMessage} "${result.organization}/${result.project}" (${branchMessage}: ${result.branch})`,
    );
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
