import { CommandRunner, Option } from 'nest-commander';
import { parseBooleanOption } from 'src/utils/parse-boolean.utils';

export type BaseOptions = {
  url?: string;
  context?: string;
  token?: string;
  skipAuth?: boolean;
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

  @Option({
    flags: '--token <token>',
    description:
      'JWT access token for this command. Overrides REVISIUM_TOKEN and REVISIUM_API_KEY.',
    required: false,
  })
  public parseToken(value: string) {
    return value;
  }

  @Option({
    flags: '--skip-auth [boolean]',
    description:
      'Treat the target as unauthenticated (e.g. a local @revisium/standalone booted without --auth). Skips the credential prompt.',
    required: false,
  })
  public parseSkipAuth(value?: string): boolean {
    return parseBooleanOption(value);
  }
}
