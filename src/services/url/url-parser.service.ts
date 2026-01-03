import { Injectable } from '@nestjs/common';

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

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1']);
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
export class UrlParserService {
  parse(input: string): RevisiumUrl {
    if (input.startsWith('revisium://')) {
      return this.parseRevisiumUrl(input);
    }

    return this.parseHostInput(input);
  }

  buildBaseUrl(protocol: string, host: string, port?: number): string {
    const portSuffix = port ? `:${port}` : '';
    return `${protocol}://${host}${portSuffix}`;
  }

  buildBaseUrlFromHost(hostWithPort: string): string {
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

  isLocalhost(host: string): boolean {
    return LOCALHOST_HOSTS.has(host.toLowerCase());
  }

  validatePort(port: number, context: string): void {
    validatePort(port, context);
  }

  private parseRevisiumUrl(url: string): RevisiumUrl {
    const withoutProtocol = url.replace('revisium://', '');

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
      if (firstColonIndex === -1) {
        username = auth;
      } else {
        username = auth.substring(0, firstColonIndex);
        password = auth.substring(firstColonIndex + 1);
      }
    }

    const pathParts = hostAndPath.split('/');
    const hostWithPort = pathParts[0];

    const baseUrl = this.buildBaseUrlFromHost(hostWithPort);

    const branchWithRevision = pathParts[3] || undefined;
    let branch: string | undefined;
    let revision: string | undefined;

    if (branchWithRevision) {
      const colonIndex = branchWithRevision.indexOf(':');
      if (colonIndex === -1) {
        branch = branchWithRevision;
      } else {
        branch = branchWithRevision.substring(0, colonIndex);
        revision = branchWithRevision.substring(colonIndex + 1);
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
}
