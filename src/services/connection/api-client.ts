import { RevisiumClient } from '@revisium/client';
import { AuthCredentials } from '../url';

interface LoginResponse {
  accessToken: string;
}

export class RevisiumApiClient {
  private static readonly LOGIN_TIMEOUT_MS = 10000;

  public readonly client: RevisiumClient;

  constructor(baseUrl: string) {
    this.client = new RevisiumClient({ baseUrl });
  }

  public async authenticate(auth: AuthCredentials): Promise<string> {
    if (auth.method === 'none') {
      return 'no auth';
    }

    if (auth.method === 'token') {
      if (!auth.token) {
        throw new Error('Token is required for token authentication');
      }
      return this.authenticateWithToken(auth.token);
    }

    if (auth.method === 'apikey') {
      if (!auth.apikey) {
        throw new Error('API key is required for apikey authentication');
      }
      return this.authenticateWithApiKey(auth.apikey);
    }

    if (!auth.username || !auth.password) {
      throw new Error(
        'Username and password are required for password authentication',
      );
    }
    return this.authenticateWithPassword(auth.username, auth.password);
  }

  private async authenticateWithToken(token: string): Promise<string> {
    this.useBearerToken(token);
    const me = await this.client.me();
    return me.username || 'authenticated user';
  }

  private async authenticateWithApiKey(apikey: string): Promise<string> {
    this.client.loginWithApiKey(apikey);
    try {
      const me = await this.client.me();
      return me.username || 'authenticated user';
    } catch {
      return 'service account';
    }
  }

  private async authenticateWithPassword(
    username: string,
    password: string,
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      RevisiumApiClient.LOGIN_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await fetch(`${this.client.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrUsername: username, password }),
        signal: controller.signal,
      });
    } catch (error) {
      if (this.isAbortError(error)) {
        throw new Error(
          `Login request timed out after ${RevisiumApiClient.LOGIN_TIMEOUT_MS}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Login failed with status ${response.status}`);
    }

    const data = await this.parseLoginResponse(response);
    this.useBearerToken(data.accessToken);
    return username;
  }

  private async parseLoginResponse(response: Response): Promise<LoginResponse> {
    let data: unknown;

    try {
      data = await response.json();
    } catch {
      throw new Error('Invalid login response: expected JSON');
    }

    if (
      typeof data !== 'object' ||
      data === null ||
      !('accessToken' in data) ||
      typeof data.accessToken !== 'string' ||
      data.accessToken.trim() === ''
    ) {
      throw new Error('Invalid login response: missing accessToken');
    }

    return { accessToken: data.accessToken };
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }

  private useBearerToken(token: string): void {
    // JWTs must be sent as Bearer tokens. The generated client auth helper
    // currently routes token input through X-Api-Key first, which standalone rejects.
    // API keys intentionally keep loginWithApiKey() so they still use X-Api-Key.
    this.client.client.setConfig({
      auth: undefined,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }
}
