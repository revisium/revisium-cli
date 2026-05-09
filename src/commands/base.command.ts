import { CommandRunner, Option } from 'nest-commander';

export type BaseOptions = {
  url?: string;
  context?: string;
};

export abstract class BaseCommand extends CommandRunner {
  @Option({
    flags: '--url <url>',
    description:
      'Revisium URL. Format: revisium://host/org/project/branch[:revision]?token=... See https://github.com/revisium/revisium-cli/blob/master/docs/url-format.md',
    required: false,
  })
  public parseUrl(value: string) {
    return value;
  }

  @Option({
    flags: '--context <name>',
    description:
      'Named workspace context from .revisium/revisium-cli.config.json (single-target commands)',
    required: false,
  })
  public parseContext(value: string) {
    return value;
  }
}
