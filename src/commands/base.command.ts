import { CommandRunner, Option } from 'nest-commander';

export type BaseOptions = {
  url?: string;
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
}
