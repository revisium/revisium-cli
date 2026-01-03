import { Injectable } from '@nestjs/common';
import { InteractiveService } from './interactive.service';
import { UrlParserService, RevisiumUrl } from './url-parser.service';
import { AuthPromptService, AuthCredentials } from './auth-prompt.service';

export { RevisiumUrl } from './url-parser.service';
export { AuthCredentials, AuthMethod } from './auth-prompt.service';

export interface RevisiumUrlComplete {
  baseUrl: string;
  auth: AuthCredentials;
  organization: string;
  project: string;
  branch: string;
  revision: string;
}

export interface UrlEnvConfig {
  url?: string;
  token?: string;
  apikey?: string;
  username?: string;
  password?: string;
}

const DEFAULT_HTTP_PORT = 8080;
const DEFAULT_BRANCH = 'master';
const DEFAULT_REVISION = 'draft';

@Injectable()
export class UrlBuilderService {
  constructor(
    private readonly interactive: InteractiveService,
    private readonly urlParser: UrlParserService,
    private readonly authPrompt: AuthPromptService,
  ) {}

  formatAsRevisiumUrl(url: RevisiumUrlComplete, maskSecrets = true): string {
    const baseUrlWithoutProtocol = url.baseUrl.replace(/^https?:\/\//, '');

    const revisionSuffix =
      url.revision && url.revision !== DEFAULT_REVISION
        ? `:${url.revision}`
        : '';
    const branchPart = url.branch ? `/${url.branch}${revisionSuffix}` : '';

    const basePath = `revisium://${baseUrlWithoutProtocol}/${url.organization}/${url.project}${branchPart}`;

    if (url.auth.method === 'token') {
      const tokenValue = maskSecrets ? '****' : url.auth.token;
      return `${basePath}?token=${tokenValue}`;
    }

    if (url.auth.method === 'apikey') {
      const apikeyValue = maskSecrets ? '****' : url.auth.apikey;
      return `${basePath}?apikey=${apikeyValue}`;
    }

    const password = maskSecrets ? '****' : url.auth.password;
    return `revisium://${url.auth.username}:${password}@${baseUrlWithoutProtocol}/${url.organization}/${url.project}${branchPart}`;
  }

  parse(input: string): RevisiumUrl {
    return this.urlParser.parse(input);
  }

  async parseAndComplete(
    input: string | undefined,
    label: string,
    env?: UrlEnvConfig,
  ): Promise<RevisiumUrlComplete> {
    let urlInput = input || env?.url;

    if (!urlInput) {
      urlInput = await this.interactive.promptText(`Enter ${label} host:`);
    }

    const parsed = this.urlParser.parse(urlInput);

    this.validateAuthMethods(parsed, env);

    const baseUrl = parsed.baseUrl || (await this.resolveBaseUrl(urlInput));

    const organization =
      parsed.organization ||
      (await this.interactive.promptText(`[${label}] Enter organization:`));

    const project =
      parsed.project ||
      (await this.interactive.promptText(`[${label}] Enter project:`));

    const branch =
      parsed.branch ||
      (await this.interactive.promptText(
        `[${label}] Enter branch:`,
        DEFAULT_BRANCH,
      ));

    const revision = parsed.revision || DEFAULT_REVISION;

    const auth = await this.resolveAuth(parsed, env, label, baseUrl);

    return {
      baseUrl,
      auth,
      organization,
      project,
      branch,
      revision,
    };
  }

  private validateAuthMethods(parsed: RevisiumUrl, env?: UrlEnvConfig): void {
    const methods: string[] = [];

    if (parsed.username || parsed.password) {
      methods.push('credentials (username/password in URL)');
    }

    if (parsed.token || env?.token) {
      methods.push('token');
    }

    if (parsed.apikey || env?.apikey) {
      methods.push('apikey');
    }

    if (methods.length > 1) {
      throw new Error(
        `Multiple authentication methods specified: ${methods.join(', ')}. ` +
          `Use only one: credentials in URL, ?token=..., or ?apikey=...`,
      );
    }
  }

  private async resolveAuth(
    parsed: RevisiumUrl,
    env: UrlEnvConfig | undefined,
    label: string,
    baseUrl: string,
  ): Promise<AuthCredentials> {
    const token = parsed.token || env?.token;
    if (token) {
      return { method: 'token', token };
    }

    const apikey = parsed.apikey || env?.apikey;
    if (apikey) {
      return { method: 'apikey', apikey };
    }

    if (parsed.username && parsed.password) {
      return {
        method: 'password',
        username: parsed.username,
        password: parsed.password,
      };
    }

    const username = parsed.username || env?.username;
    const password = parsed.password || env?.password;

    if (username && password) {
      return { method: 'password', username, password };
    }

    return this.authPrompt.promptForAuth(label, baseUrl);
  }

  private async resolveBaseUrl(input: string): Promise<string> {
    let hostWithPort = input.trim();

    if (hostWithPort.endsWith('/')) {
      hostWithPort = hostWithPort.slice(0, -1);
    }

    if (
      hostWithPort.startsWith('http://') ||
      hostWithPort.startsWith('https://')
    ) {
      return hostWithPort;
    }

    const [host, existingPort] = hostWithPort.split(':');

    if (existingPort) {
      const port = Number.parseInt(existingPort, 10);
      this.urlParser.validatePort(port, `in "${hostWithPort}"`);
      const isLocalhost = this.urlParser.isLocalhost(host);
      const protocol = isLocalhost ? 'http' : 'https';
      return this.urlParser.buildBaseUrl(protocol, host, port);
    }

    const isLocalhost = this.urlParser.isLocalhost(host);

    if (isLocalhost) {
      const portStr = await this.interactive.promptText(
        `Enter port:`,
        String(DEFAULT_HTTP_PORT),
      );
      const port = Number.parseInt(portStr, 10);
      this.urlParser.validatePort(port, 'entered');
      return this.urlParser.buildBaseUrl('http', host, port);
    }

    const useHttps = await this.interactive.promptConfirm('Use HTTPS?', true);
    const protocol = useHttps ? 'https' : 'http';

    if (!useHttps) {
      const portStr = await this.interactive.promptText(
        `Enter port:`,
        String(DEFAULT_HTTP_PORT),
      );
      const port = Number.parseInt(portStr, 10);
      this.urlParser.validatePort(port, 'entered');
      return this.urlParser.buildBaseUrl(protocol, host, port);
    }

    return this.urlParser.buildBaseUrl(protocol, host);
  }
}
