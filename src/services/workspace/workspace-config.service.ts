import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';
import { Injectable, Optional } from '@nestjs/common';
import {
  AuthCredentials,
  RevisiumUrlComplete,
  UrlEnvConfig,
} from 'src/services/url';
import { CredentialStoreService } from 'src/services/credentials/credential-store.service';
import { UrlParserService } from 'src/services/url/url-parser.service';

export const WORKSPACE_CONFIG_DIR = '.revisium';
export const WORKSPACE_CONFIG_FILE = 'revisium-cli.config.json';
export const DEFAULT_BRANCH = 'master';
export const DEFAULT_REVISION = 'draft';
export const DEFAULT_CREDENTIAL = 'default';

export type WorkspaceAuthMode = 'none' | 'stored';

export interface WorkspaceInstanceConfig {
  baseUrl: string;
  authMode?: WorkspaceAuthMode;
}

export interface WorkspaceContextConfig {
  instance: string;
  credential?: string;
  organization: string;
  project: string;
  branch?: string;
  revision?: string;
}

export interface WorkspaceConfig {
  version: 1;
  currentContext?: string;
  instances: Record<string, WorkspaceInstanceConfig>;
  contexts: Record<string, WorkspaceContextConfig>;
}

export interface LoadedWorkspaceConfig {
  path: string;
  config: WorkspaceConfig;
}

export interface LoadedWorkspaceContext {
  loaded: LoadedWorkspaceConfig;
  context: WorkspaceContextConfig;
}

@Injectable()
export class WorkspaceConfigService {
  constructor(
    private readonly urlParser: UrlParserService,
    @Optional() private readonly credentialStore?: CredentialStoreService,
  ) {}

  async load(
    startDir = process.cwd(),
  ): Promise<LoadedWorkspaceConfig | undefined> {
    const configPath = await this.findConfigPath(startDir);
    if (!configPath) {
      return undefined;
    }

    const raw = await readFile(configPath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TypeError(
        `Failed to parse Revisium workspace config at ${configPath}: ${message}`,
      );
    }

    return {
      path: configPath,
      config: this.normalizeConfig(parsed, configPath),
    };
  }

  async loadOrCreate(startDir = process.cwd()): Promise<LoadedWorkspaceConfig> {
    const loaded = await this.load(startDir);
    if (loaded) {
      return loaded;
    }

    return {
      path: this.getDefaultConfigPath(startDir),
      config: this.createEmptyConfig(),
    };
  }

  async save(path: string, config: WorkspaceConfig): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
  }

  async loadContext(
    name: string,
    startDir = process.cwd(),
  ): Promise<LoadedWorkspaceContext> {
    const loaded = await this.load(startDir);
    if (!loaded || !Object.hasOwn(loaded.config.contexts, name)) {
      throw new Error(`Revisium context "${name}" was not found`);
    }

    return {
      loaded,
      context: loaded.config.contexts[name],
    };
  }

  async findConfigPath(startDir = process.cwd()): Promise<string | undefined> {
    let currentDir = resolve(startDir);
    const root = parse(currentDir).root;

    while (true) {
      const candidate = this.getDefaultConfigPath(currentDir);
      if (await this.exists(candidate)) {
        return candidate;
      }

      if (currentDir === root) {
        return undefined;
      }

      currentDir = dirname(currentDir);
    }
  }

  getDefaultConfigPath(startDir = process.cwd()): string {
    return join(resolve(startDir), WORKSPACE_CONFIG_DIR, WORKSPACE_CONFIG_FILE);
  }

  createEmptyConfig(): WorkspaceConfig {
    return {
      version: 1,
      instances: {},
      contexts: {},
    };
  }

  normalizeBaseUrl(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error('Instance URL cannot be empty');
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return this.normalizeHttpBaseUrl(trimmed, input);
    }

    const parsed = this.urlParser.parse(trimmed);
    if (!parsed.baseUrl) {
      throw new Error(
        `Could not parse instance URL "${input}". Use revisium://host[:port]`,
      );
    }

    return this.stripTrailingSlashes(parsed.baseUrl);
  }

  parseContextUrl(input: string): {
    baseUrl: string;
    organization: string;
    project: string;
    branch: string;
    revision: string;
  } {
    const parsed = this.urlParser.parse(input);

    if (!parsed.baseUrl || !parsed.organization || !parsed.project) {
      throw new Error(
        'Context URL must include host, organization, and project: revisium://host/org/project/branch[:revision]',
      );
    }

    return {
      baseUrl: this.stripTrailingSlashes(parsed.baseUrl),
      organization: parsed.organization,
      project: parsed.project,
      branch: parsed.branch || DEFAULT_BRANCH,
      revision: parsed.revision || DEFAULT_REVISION,
    };
  }

  findInstanceNameByBaseUrl(
    config: WorkspaceConfig,
    baseUrl: string,
  ): string | undefined {
    const matches = Object.entries(config.instances)
      .filter(([, instance]) => instance.baseUrl === baseUrl)
      .map(([name]) => name);

    if (matches.length > 1) {
      throw new Error(
        `Multiple instances use ${baseUrl}. Pass --instance to choose one.`,
      );
    }

    return matches[0];
  }

  resolveConnection(
    loaded: LoadedWorkspaceConfig,
    contextName: string | undefined,
    env: UrlEnvConfig,
  ): RevisiumUrlComplete {
    const selectedContext = contextName || loaded.config.currentContext;

    if (!selectedContext) {
      throw new Error(
        `No current Revisium context is configured in ${loaded.path}. Run: revisium context use <name>`,
      );
    }

    const context = loaded.config.contexts[selectedContext];
    if (!context) {
      throw new Error(
        `Revisium context "${selectedContext}" was not found in ${loaded.path}`,
      );
    }

    const instance = loaded.config.instances[context.instance];
    if (!instance) {
      throw new Error(
        `Revisium instance "${context.instance}" for context "${selectedContext}" was not found in ${loaded.path}`,
      );
    }

    return {
      baseUrl: instance.baseUrl,
      auth: this.resolveAuth(instance, context, selectedContext, env),
      organization: context.organization,
      project: context.project,
      branch: context.branch || DEFAULT_BRANCH,
      revision: context.revision || DEFAULT_REVISION,
    };
  }

  private resolveAuth(
    instance: WorkspaceInstanceConfig,
    context: WorkspaceContextConfig,
    contextName: string,
    env: UrlEnvConfig,
  ): AuthCredentials {
    const envAuth = this.resolveEnvAuth(env);
    if (envAuth) {
      return envAuth;
    }

    if ((instance.authMode || 'stored') === 'none') {
      return { method: 'none' };
    }

    const credential = context.credential || DEFAULT_CREDENTIAL;
    const credentialRef = {
      baseUrl: instance.baseUrl,
      credential,
    };
    const savedCredential = this.resolveSavedCredential(
      credentialRef,
      contextName,
      context.instance,
    );
    if (savedCredential) {
      return savedCredential;
    }

    throw new Error(
      `No credentials found for context "${contextName}" credential "${credential}". ` +
        `Run: revisium auth login --instance ${context.instance} --credential ${credential} --api-key. ` +
        'Or set REVISIUM_API_KEY=... / REVISIUM_TOKEN=..., or configure the instance with authMode "none" for local standalone.',
    );
  }

  private resolveSavedCredential(
    ref: {
      baseUrl: string;
      credential: string;
    },
    contextName: string,
    instanceName: string,
  ): AuthCredentials | undefined {
    try {
      return this.credentialStore?.getCredential(ref);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('Could not read Revisium credential')) {
        throw new Error(
          `No credentials found for context "${contextName}" credential "${ref.credential}". ` +
            `Could not read the OS credential store: ${message}. ` +
            `Run: revisium auth login --instance ${instanceName} --credential ${ref.credential} --api-key. ` +
            'Or set REVISIUM_API_KEY=... / REVISIUM_TOKEN=... for this run.',
        );
      }
      throw error;
    }
  }

  private resolveEnvAuth(env: UrlEnvConfig): AuthCredentials | undefined {
    const methods: string[] = [];

    if (env.token) {
      methods.push('token');
    }
    if (env.apikey) {
      methods.push('apikey');
    }
    if (env.username || env.password) {
      if (!env.username || !env.password) {
        throw new Error(
          'Both REVISIUM_USERNAME and REVISIUM_PASSWORD are required for password authentication',
        );
      }
      methods.push('credentials');
    }

    if (methods.length > 1) {
      throw new Error(
        `Multiple authentication methods specified: ${methods.join(', ')}. ` +
          'Use only one: token, apikey, or username/password',
      );
    }

    if (env.token) {
      return { method: 'token', token: env.token };
    }
    if (env.apikey) {
      return { method: 'apikey', apikey: env.apikey };
    }
    if (env.username && env.password) {
      return {
        method: 'password',
        username: env.username,
        password: env.password,
      };
    }

    return undefined;
  }

  private normalizeConfig(value: unknown, path: string): WorkspaceConfig {
    if (!this.isObject(value)) {
      throw new TypeError(
        `Invalid Revisium CLI config at ${path}: expected object`,
      );
    }

    const version = value.version;
    if (version !== 1) {
      throw new Error(
        `Invalid Revisium CLI config at ${path}: unsupported version ${String(version)}`,
      );
    }

    const instances = this.normalizeRecord<WorkspaceInstanceConfig>(
      value.instances,
      'instances',
      path,
    );
    const contexts = this.normalizeRecord<WorkspaceContextConfig>(
      value.contexts,
      'contexts',
      path,
    );

    for (const [name, instance] of Object.entries(instances)) {
      if (!this.isObject(instance) || typeof instance.baseUrl !== 'string') {
        throw new TypeError(
          `Invalid Revisium CLI config at ${path}: instance "${name}" must include baseUrl`,
        );
      }
      instance.baseUrl = this.normalizeBaseUrl(instance.baseUrl);
      if (
        instance.authMode !== undefined &&
        instance.authMode !== 'none' &&
        instance.authMode !== 'stored'
      ) {
        throw new Error(
          `Invalid Revisium CLI config at ${path}: instance "${name}" has unsupported authMode`,
        );
      }
    }

    for (const [name, context] of Object.entries(contexts)) {
      if (
        !this.isObject(context) ||
        typeof context.instance !== 'string' ||
        typeof context.organization !== 'string' ||
        typeof context.project !== 'string'
      ) {
        throw new TypeError(
          `Invalid Revisium CLI config at ${path}: context "${name}" must include instance, organization, and project`,
        );
      }
    }

    return {
      version: 1,
      currentContext:
        typeof value.currentContext === 'string'
          ? value.currentContext
          : undefined,
      instances,
      contexts,
    };
  }

  private normalizeRecord<T>(
    value: unknown,
    key: string,
    path: string,
  ): Record<string, T> {
    if (value === undefined) {
      return {};
    }
    if (!this.isObject(value)) {
      throw new TypeError(
        `Invalid Revisium CLI config at ${path}: ${key} must be an object`,
      );
    }
    return value as Record<string, T>;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private stripTrailingSlashes(value: string): string {
    let endIndex = value.length;
    while (endIndex > 0 && value[endIndex - 1] === '/') {
      endIndex--;
    }
    return value.slice(0, endIndex);
  }

  private normalizeHttpBaseUrl(value: string, originalInput: string): string {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(
        `Could not parse instance URL "${originalInput}". Use http(s)://host[:port]`,
      );
    }

    const hasPath = parsed.pathname !== '' && parsed.pathname !== '/';
    if (
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      hasPath ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error(
        `Could not parse instance URL "${originalInput}". Use http(s)://host[:port]`,
      );
    }

    return `${parsed.protocol}//${parsed.host}`;
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
