import { CommandRunner, Option } from 'nest-commander';

export abstract class BaseCommand extends CommandRunner {
  @Option({
    flags: '-o, --organization <organization>',
    description: 'organization name',
    required: false,
  })
  public parseOrganization(value: string) {
    return value;
  }

  @Option({
    flags: '-p, --project <project>',
    description: 'project name',
    required: false,
  })
  public parseProject(value: string) {
    return value;
  }

  @Option({
    flags: '-b, --branch <branch>',
    description: 'branch name',
    required: false,
  })
  public parseBranch(value: string) {
    return value;
  }

  @Option({
    flags: '--url <api url>',
    description: 'api url',
    required: false,
  })
  public parseApiUrl(value: string) {
    return value;
  }

  @Option({
    flags: '--username <username>',
    description: 'username',
    required: false,
  })
  public parseUsername(value: string) {
    return value;
  }

  @Option({
    flags: '--password <password>',
    description: 'password',
    required: false,
  })
  public parsePassword(value: string) {
    return value;
  }
}
