import { Injectable } from '@nestjs/common';
import { InteractiveService } from './interactive.service';

export type AuthMethod = 'token' | 'apikey' | 'password';

export interface AuthCredentials {
  method: AuthMethod;
  token?: string;
  apikey?: string;
  username?: string;
  password?: string;
}

export interface RevisiumUrl {
  baseUrl: string;
  username?: string;
  password?: string;
  token?: string;
  apikey?: string;
  organization?: string;
  project?: string;
  branch?: string;
  revision?: string;
}

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

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1']);
const DEFAULT_HTTP_PORT = 8080;
const DEFAULT_BRANCH = 'master';
const DEFAULT_REVISION = 'draft';
const MIN_PORT = 1;
const MAX_PORT = 65535;

function validatePort(port: number, context: string): void {
  if (Number.isNaN(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `Invalid port ${context}: must be a number between ${MIN_PORT} and ${MAX_PORT}`,
    );
  }
}

@Injectable()
export class UrlBuilderService {
  constructor(private readonly interactive: InteractiveService) {}

  formatAsRevisiumUrl(url: RevisiumUrlComplete, maskSecrets = true): string {
    const baseUrlWithoutProtocol = url.baseUrl.replace(/^https?:\/\//, '');

    // Format branch:revision (e.g., "master:head", "develop:draft")
    const revisionSuffix =
      url.revision && url.revision !== DEFAULT_REVISION
        ? `:${url.revision}`
        : '';
    const branchPart = url.branch ? `/${url.branch}${revisionSuffix}` : '';

    const basePath = `revisium://${baseUrlWithoutProtocol}/${url.organization}/${url.project}${branchPart}`;

    // Format auth based on method
    if (url.auth.method === 'token') {
      const tokenValue = maskSecrets ? '****' : url.auth.token;
      return `${basePath}?token=${tokenValue}`;
    }

    if (url.auth.method === 'apikey') {
      const apikeyValue = maskSecrets ? '****' : url.auth.apikey;
      return `${basePath}?apikey=${apikeyValue}`;
    }

    // Password method - credentials in URL
    const password = maskSecrets ? '****' : url.auth.password;
    return `revisium://${url.auth.username}:${password}@${baseUrlWithoutProtocol}/${url.organization}/${url.project}${branchPart}`;
  }

  parse(input: string): RevisiumUrl {
    if (input.startsWith('revisium://')) {
      return this.parseRevisiumUrl(input);
    }

    return this.parseHostInput(input);
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

    const parsed = this.parse(urlInput);

    // Validate mutual exclusion of auth methods
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

    // Resolve auth credentials
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

    // Check URL credentials
    if (parsed.username || parsed.password) {
      methods.push('credentials (username/password in URL)');
    }

    // Check token
    if (parsed.token || env?.token) {
      methods.push('token');
    }

    // Check apikey
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
    // Priority: URL params > env > interactive

    // 1. Token from URL or env
    const token = parsed.token || env?.token;
    if (token) {
      return { method: 'token', token };
    }

    // 2. API Key from URL or env
    const apikey = parsed.apikey || env?.apikey;
    if (apikey) {
      return { method: 'apikey', apikey };
    }

    // 3. Credentials from URL or env
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

    // 4. Interactive prompt
    return this.promptForAuth(label, baseUrl);
  }

  private async promptForAuth(
    label: string,
    baseUrl: string,
  ): Promise<AuthCredentials> {
    const tokenPageUrl = this.getTokenPageUrl(baseUrl);

    const authMethod = await this.interactive.promptSelect<AuthMethod>(
      `[${label}] Choose authentication method:`,
      [
        {
          name: `Token (copy from ${tokenPageUrl})`,
          value: 'token' as AuthMethod,
        },
        {
          name: 'API Key (for automated access)',
          value: 'apikey' as AuthMethod,
        },
        { name: 'Username & Password', value: 'password' as AuthMethod },
      ],
    );

    if (authMethod === 'token') {
      const token = await this.interactive.promptPassword(
        `[${label}] Paste token:`,
      );
      return { method: 'token', token };
    }

    if (authMethod === 'apikey') {
      const apikey = await this.interactive.promptPassword(
        `[${label}] Enter API key:`,
      );
      return { method: 'apikey', apikey };
    }

    const username = await this.interactive.promptText(
      `[${label}] Enter username:`,
    );
    const password = await this.interactive.promptPassword(
      `[${label}] Enter password:`,
    );

    return { method: 'password', username, password };
  }

  private getTokenPageUrl(baseUrl: string): string {
    return `${baseUrl}/get-mcp-token`;
  }

  buildBaseUrl(protocol: string, host: string, port?: number): string {
    const portSuffix = port ? `:${port}` : '';
    return `${protocol}://${host}${portSuffix}`;
  }

  private parseRevisiumUrl(url: string): RevisiumUrl {
    const withoutProtocol = url.replace('revisium://', '');

    // Split query parameters first
    const [mainPart, queryString] = withoutProtocol.split('?');
    const queryParams = this.parseQueryParams(queryString);

    let auth: string | undefined;
    let hostAndPath: string;

    const lastAtIndex = mainPart.lastIndexOf('@');
    const firstSlashIndex = mainPart.indexOf('/');

    const atIsBeforeFirstSlash =
      lastAtIndex !== -1 &&
      (firstSlashIndex === -1 || lastAtIndex < firstSlashIndex);

    if (atIsBeforeFirstSlash) {
      auth = mainPart.substring(0, lastAtIndex);
      hostAndPath = mainPart.substring(lastAtIndex + 1);
    } else {
      hostAndPath = mainPart;
    }

    let username: string | undefined;
    let password: string | undefined;

    if (auth) {
      const firstColonIndex = auth.indexOf(':');
      if (firstColonIndex !== -1) {
        username = auth.substring(0, firstColonIndex);
        password = auth.substring(firstColonIndex + 1);
      } else {
        username = auth;
      }
    }

    const pathParts = hostAndPath.split('/');
    const hostWithPort = pathParts[0];

    const baseUrl = this.buildBaseUrlFromHost(hostWithPort);

    // Parse branch:revision format (e.g., "master:head", "develop:draft", "main:abc123")
    const branchWithRevision = pathParts[3] || undefined;
    let branch: string | undefined;
    let revision: string | undefined;

    if (branchWithRevision) {
      const colonIndex = branchWithRevision.indexOf(':');
      if (colonIndex !== -1) {
        branch = branchWithRevision.substring(0, colonIndex);
        revision = branchWithRevision.substring(colonIndex + 1);
      } else {
        branch = branchWithRevision;
      }
    }

    return {
      baseUrl,
      username,
      password,
      token: queryParams.token,
      apikey: queryParams.apikey,
      organization: pathParts[1] || undefined,
      project: pathParts[2] || undefined,
      branch,
      revision,
    };
  }

  private parseQueryParams(queryString: string | undefined): {
    token?: string;
    apikey?: string;
  } {
    if (!queryString) {
      return {};
    }

    const params: { token?: string; apikey?: string } = {};
    const pairs = queryString.split('&');

    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key === 'token') {
        params.token = decodeURIComponent(value || '');
      } else if (key === 'apikey') {
        params.apikey = decodeURIComponent(value || '');
      }
    }

    return params;
  }

  private parseHostInput(input: string): RevisiumUrl {
    const hostWithPort = input.trim();

    if (!hostWithPort) {
      return { baseUrl: '' };
    }

    return {
      baseUrl: '',
      username: undefined,
      password: undefined,
      organization: undefined,
      project: undefined,
      branch: undefined,
    };
  }

  private buildBaseUrlFromHost(hostWithPort: string): string {
    const [host, portStr] = hostWithPort.split(':');
    const port = portStr ? Number.parseInt(portStr, 10) : undefined;

    if (port !== undefined) {
      validatePort(port, `in "${hostWithPort}"`);
    }

    const isLocalhost = LOCALHOST_HOSTS.has(host.toLowerCase());
    const protocol = isLocalhost ? 'http' : 'https';

    if (port) {
      return this.buildBaseUrl(protocol, host, port);
    }

    return this.buildBaseUrl(protocol, host);
  }

  private async resolveBaseUrl(input: string): Promise<string> {
    let hostWithPort = input.trim();

    // Remove trailing slash
    if (hostWithPort.endsWith('/')) {
      hostWithPort = hostWithPort.slice(0, -1);
    }

    // If input already has http:// or https://, extract and use it
    if (
      hostWithPort.startsWith('http://') ||
      hostWithPort.startsWith('https://')
    ) {
      return hostWithPort;
    }

    const [host, existingPort] = hostWithPort.split(':');

    if (existingPort) {
      const port = Number.parseInt(existingPort, 10);
      validatePort(port, `in "${hostWithPort}"`);
      const isLocalhost = LOCALHOST_HOSTS.has(host.toLowerCase());
      const protocol = isLocalhost ? 'http' : 'https';
      return this.buildBaseUrl(protocol, host, port);
    }

    const isLocalhost = LOCALHOST_HOSTS.has(host.toLowerCase());

    if (isLocalhost) {
      const portStr = await this.interactive.promptText(
        `Enter port:`,
        String(DEFAULT_HTTP_PORT),
      );
      const port = Number.parseInt(portStr, 10);
      validatePort(port, 'entered');
      return this.buildBaseUrl('http', host, port);
    }

    const useHttps = await this.interactive.promptConfirm('Use HTTPS?', true);
    const protocol = useHttps ? 'https' : 'http';

    if (!useHttps) {
      const portStr = await this.interactive.promptText(
        `Enter port:`,
        String(DEFAULT_HTTP_PORT),
      );
      const port = Number.parseInt(portStr, 10);
      validatePort(port, 'entered');
      return this.buildBaseUrl(protocol, host, port);
    }

    return this.buildBaseUrl(protocol, host);
  }
}
