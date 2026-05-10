import { Injectable } from '@nestjs/common';
import {
  DEFAULT_CREDENTIAL,
  WorkspaceAuthMode,
  WorkspaceConfigService,
} from 'src/services/workspace';

export interface CredentialTargetOptions {
  url?: string;
  instance?: string;
  credential?: string;
}

export interface CredentialTarget {
  baseUrl: string;
  credential: string;
  instanceName?: string;
  contextName?: string;
  authMode?: WorkspaceAuthMode;
  configPath?: string;
}

@Injectable()
export class CredentialTargetService {
  constructor(private readonly workspaceConfig: WorkspaceConfigService) {}

  async resolveRequired(
    options: CredentialTargetOptions,
  ): Promise<CredentialTarget> {
    if (!options.url && !options.instance) {
      throw new Error('Pass --instance <name> or --url <revisium-url>');
    }

    return this.resolve(options, false);
  }

  async resolveOrCurrentContext(
    options: CredentialTargetOptions,
  ): Promise<CredentialTarget> {
    return this.resolve(options, true);
  }

  private async resolve(
    options: CredentialTargetOptions,
    allowCurrentContext: boolean,
  ): Promise<CredentialTarget> {
    if (options.url && options.instance) {
      throw new Error('Use only one target selector: --instance or --url');
    }

    if (options.url) {
      return this.resolveUrlTarget(options);
    }

    const loaded = await this.workspaceConfig.load();
    if (!loaded) {
      throw new Error(
        'No Revisium workspace config found. Pass --url <revisium-url> or run revisium instance add first.',
      );
    }

    if (options.instance) {
      const instance = loaded.config.instances[options.instance];
      if (!instance) {
        throw new Error(
          `Revisium instance "${options.instance}" was not found`,
        );
      }

      return {
        baseUrl: instance.baseUrl,
        credential: options.credential || DEFAULT_CREDENTIAL,
        instanceName: options.instance,
        authMode: instance.authMode || 'stored',
        configPath: loaded.path,
      };
    }

    if (!allowCurrentContext) {
      throw new Error('Pass --instance <name> or --url <revisium-url>');
    }

    const contextName = loaded.config.currentContext;
    if (!contextName) {
      throw new Error(
        `No current Revisium context is configured in ${loaded.path}. Run: revisium context use <name>`,
      );
    }

    const context = loaded.config.contexts[contextName];
    if (!context) {
      throw new Error(`Revisium context "${contextName}" was not found`);
    }

    const instance = loaded.config.instances[context.instance];
    if (!instance) {
      throw new Error(
        `Revisium instance "${context.instance}" for context "${contextName}" was not found`,
      );
    }

    return {
      baseUrl: instance.baseUrl,
      credential:
        options.credential || context.credential || DEFAULT_CREDENTIAL,
      instanceName: context.instance,
      contextName,
      authMode: instance.authMode || 'stored',
      configPath: loaded.path,
    };
  }

  private async resolveUrlTarget(
    options: CredentialTargetOptions,
  ): Promise<CredentialTarget> {
    if (!options.url) {
      throw new Error('Pass --url <revisium-url>');
    }

    const baseUrl = this.workspaceConfig.normalizeBaseUrl(options.url);
    const loaded = await this.workspaceConfig.load();
    if (!loaded) {
      return {
        baseUrl,
        credential: options.credential || DEFAULT_CREDENTIAL,
      };
    }

    const instanceName = this.workspaceConfig.findInstanceNameByBaseUrl(
      loaded.config,
      baseUrl,
    );
    const instance = instanceName
      ? loaded.config.instances[instanceName]
      : undefined;

    return {
      baseUrl,
      credential: options.credential || DEFAULT_CREDENTIAL,
      instanceName,
      authMode: instance?.authMode || 'stored',
      configPath: loaded.path,
    };
  }
}
