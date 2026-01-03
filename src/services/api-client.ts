import { Api, RequestParams } from 'src/__generated__/api';
import { AuthCredentials } from './url-builder.service';

export class RevisiumApiClient extends Api<unknown> {
  public authToken: string | undefined = undefined;

  constructor(baseUrl: string) {
    super({ baseUrl });
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
    this.authToken = token;
    const response = await this.api.me();

    if (response.error) {
      throw new Error(
        `Token validation failed: ${JSON.stringify(response.error)}`,
      );
    }

    return response.data.username || 'authenticated user';
  }

  private async authenticateWithApiKey(apikey: string): Promise<string> {
    this.authToken = apikey;
    const response = await this.api.me();

    if (response.error) {
      throw new Error(
        `API key validation failed: ${JSON.stringify(response.error)}`,
      );
    }

    return response.data.username || 'authenticated user';
  }

  private async authenticateWithPassword(
    username: string,
    password: string,
  ): Promise<string> {
    const response = await this.api.login({
      emailOrUsername: username,
      password: password,
    });

    if (response.error) {
      throw new Error(`Login failed: ${JSON.stringify(response.error)}`);
    }

    this.authToken = response.data.accessToken;
    return username;
  }

  protected mergeRequestParams(
    params1: RequestParams,
    params2?: RequestParams,
  ): RequestParams {
    const params = super.mergeRequestParams(params1, params2);

    params.headers ??= {};

    if (this.authToken) {
      (params.headers as Record<string, string>)['Authorization'] =
        `Bearer ${this.authToken}`;
    }

    return params;
  }
}
