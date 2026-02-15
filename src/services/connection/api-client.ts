import { RevisiumClient } from '@revisium/client';
import { AuthCredentials } from '../url';

export class RevisiumApiClient {
  public readonly client: RevisiumClient;

  constructor(baseUrl: string) {
    this.client = new RevisiumClient({ baseUrl });
  }

  public async authenticate(auth: AuthCredentials): Promise<string> {
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
    this.client.loginWithToken(token);
    const me = await this.client.me();
    return me.username || 'authenticated user';
  }

  private async authenticateWithApiKey(apikey: string): Promise<string> {
    this.client.loginWithToken(apikey);
    const me = await this.client.me();
    return me.username || 'authenticated user';
  }

  private async authenticateWithPassword(
    username: string,
    password: string,
  ): Promise<string> {
    await this.client.login(username, password);
    return username;
  }
}
