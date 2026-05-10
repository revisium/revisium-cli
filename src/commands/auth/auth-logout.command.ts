import { CommandRunner, Option, SubCommand } from 'nest-commander';
import {
  CredentialStoreService,
  CredentialTargetService,
} from 'src/services/credentials';
import { LoggerService } from 'src/services/common';
import { formatAuthTarget } from './auth-command.utils';

interface Options {
  url?: string;
  instance?: string;
  credential?: string;
}

@SubCommand({
  name: 'logout',
  description: 'Delete a saved Revisium credential',
})
export class AuthLogoutCommand extends CommandRunner {
  constructor(
    private readonly credentialTargets: CredentialTargetService,
    private readonly credentialStore: CredentialStoreService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    const target =
      await this.credentialTargets.resolveOrCurrentContext(options);
    const deleted = this.credentialStore.deleteCredential({
      baseUrl: target.baseUrl,
      credential: target.credential,
    });

    if (deleted) {
      this.logger.success(
        `Deleted saved credential "${target.credential}" for ${formatAuthTarget(target.instanceName, target.baseUrl)}`,
      );
      return;
    }

    this.logger.warn(
      `No saved credential "${target.credential}" found for ${formatAuthTarget(target.instanceName, target.baseUrl)}`,
    );
  }

  @Option({
    flags: '--url <url>',
    description: 'Revisium server or target URL',
  })
  parseUrl(value: string) {
    return value;
  }

  @Option({
    flags: '--instance <name>',
    description: 'Instance name from workspace config',
  })
  parseInstance(value: string) {
    return value;
  }

  @Option({
    flags: '--credential <name>',
    description: 'Credential name',
  })
  parseCredential(value: string) {
    return value;
  }
}
