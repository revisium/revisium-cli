import { CommandRunner, Option, SubCommand } from 'nest-commander';
import {
  CredentialStoreService,
  CredentialTargetService,
} from 'src/services/credentials';
import { LoggerService } from 'src/services/common';

interface Options {
  url?: string;
  instance?: string;
  credential?: string;
}

@SubCommand({
  name: 'status',
  description: 'Show saved Revisium credential status',
})
export class AuthStatusCommand extends CommandRunner {
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
    const ref = {
      baseUrl: target.baseUrl,
      credential: target.credential,
    };
    const hasCredential = this.credentialStore.hasCredential(ref);

    if (target.contextName) {
      this.logger.info(`Context: ${target.contextName}`);
    }
    if (target.instanceName) {
      this.logger.info(`Instance: ${target.instanceName}`);
    }
    this.logger.info(`Base URL: ${target.baseUrl}`);
    this.logger.info(`Credential: ${target.credential}`);
    this.logger.info(`Auth mode: ${target.authMode || 'stored'}`);

    if ((target.authMode || 'stored') === 'none') {
      this.logger.info('Saved credentials are bypassed for authMode "none".');
    }

    if (hasCredential) {
      this.logger.success('Saved credential found');
      this.logger.info(
        'API key identity verification is limited until auth principal introspection is available.',
      );
      return;
    }

    this.logger.warn(
      `No saved credential found. Run: revisium auth login ${this.formatLoginHint(target)}`,
    );
  }

  private formatLoginHint(target: {
    instanceName?: string;
    baseUrl: string;
    credential: string;
  }): string {
    const targetSelector = target.instanceName
      ? `--instance ${target.instanceName}`
      : `--url revisium://${target.baseUrl.replace(/^https?:\/\//, '')}`;
    return `${targetSelector} --credential ${target.credential} --api-key`;
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
