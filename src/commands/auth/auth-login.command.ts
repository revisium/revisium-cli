import { CommandRunner, Option, SubCommand } from 'nest-commander';
import {
  CredentialStoreService,
  CredentialTargetService,
} from 'src/services/credentials';
import { InteractiveService, LoggerService } from 'src/services/common';
import { parseBooleanOption } from 'src/utils/parse-boolean.utils';

interface Options {
  url?: string;
  instance?: string;
  credential?: string;
  apiKey?: boolean;
  apiKeyStdin?: boolean;
  force?: boolean;
}

@SubCommand({
  name: 'login',
  description: 'Save an API key in the OS credential store',
})
export class AuthLoginCommand extends CommandRunner {
  constructor(
    private readonly credentialTargets: CredentialTargetService,
    private readonly credentialStore: CredentialStoreService,
    private readonly interactive: InteractiveService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (options.apiKey && options.apiKeyStdin) {
      throw new Error(
        'Use only one credential input: --api-key or --api-key-stdin',
      );
    }
    if (!options.apiKey && !options.apiKeyStdin) {
      throw new Error(
        'Pass --api-key to prompt, or --api-key-stdin for scripts',
      );
    }

    const target = await this.credentialTargets.resolveRequired(options);
    if (target.authMode === 'none' && !options.force) {
      throw new Error(
        `Instance "${target.instanceName || target.baseUrl}" uses authMode "none". Pass --force to save credentials anyway.`,
      );
    }

    const apiKey = options.apiKeyStdin
      ? await this.readApiKeyFromStdin()
      : await this.promptForApiKey();

    this.credentialStore.saveApiKey(
      {
        baseUrl: target.baseUrl,
        credential: target.credential,
      },
      apiKey,
    );

    this.logger.success(
      `Saved API key credential "${target.credential}" for ${this.formatTarget(target.instanceName, target.baseUrl)}`,
    );
  }

  private async promptForApiKey(): Promise<string> {
    const apiKey = await this.interactive.promptPassword(
      'Enter Revisium API key:',
    );
    return this.validateApiKey(apiKey);
  }

  private async readApiKeyFromStdin(): Promise<string> {
    const chunks: Buffer[] = [];

    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      if (Buffer.concat(chunks).includes(10)) {
        break;
      }
    }

    return this.validateApiKey(
      Buffer.concat(chunks).toString('utf-8').split(/\r?\n/, 1)[0],
    );
  }

  private validateApiKey(value: string | undefined): string {
    const apiKey = value?.trim();
    if (!apiKey) {
      throw new Error('API key cannot be empty');
    }
    return apiKey;
  }

  private formatTarget(
    instanceName: string | undefined,
    baseUrl: string,
  ): string {
    return instanceName ? `instance "${instanceName}" (${baseUrl})` : baseUrl;
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
    description: 'Credential name (default: default)',
  })
  parseCredential(value: string) {
    return value;
  }

  @Option({
    flags: '--api-key',
    description: 'Prompt for an API key and save it',
  })
  parseApiKey(): boolean {
    return true;
  }

  @Option({
    flags: '--api-key-stdin',
    description: 'Read one API key line from stdin and save it',
  })
  parseApiKeyStdin(): boolean {
    return true;
  }

  @Option({
    flags: '--force [boolean]',
    description: 'Allow saving credentials for an authMode none instance',
  })
  parseForce(value?: string): boolean {
    return parseBooleanOption(value);
  }
}
