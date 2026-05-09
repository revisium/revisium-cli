import type { MeModel } from '@revisium/client';
import { RevisiumApiClient } from '../api-client';
import type { AuthCredentials } from '../../url';

describe('RevisiumApiClient', () => {
  let apiClient: RevisiumApiClient;

  beforeEach(() => {
    apiClient = new RevisiumApiClient('http://localhost:8080');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('authenticate with no auth', () => {
    it('does not call login methods', async () => {
      const loginWithTokenSpy = jest.spyOn(apiClient.client, 'loginWithToken');
      const loginWithApiKeySpy = jest.spyOn(
        apiClient.client,
        'loginWithApiKey',
      );
      const loginSpy = jest.spyOn(apiClient.client, 'login');
      const setConfigSpy = jest.spyOn(apiClient.client.client, 'setConfig');

      const result = await apiClient.authenticate({ method: 'none' });

      expect(result).toBe('no auth');
      expect(loginWithTokenSpy).not.toHaveBeenCalled();
      expect(loginWithApiKeySpy).not.toHaveBeenCalled();
      expect(loginSpy).not.toHaveBeenCalled();
      expect(setConfigSpy).not.toHaveBeenCalled();
    });
  });

  describe('authenticateWithApiKey (via authenticate)', () => {
    it('calls loginWithApiKey on the underlying client', async () => {
      const loginWithApiKeySpy = jest
        .spyOn(apiClient.client, 'loginWithApiKey')
        .mockImplementation(() => {});
      const meSpy = jest
        .spyOn(apiClient.client, 'me')
        .mockResolvedValue({ username: 'key-owner' } as MeModel);

      const result = await apiClient.authenticate({
        method: 'apikey',
        apikey: 'rev_test_key',
      });

      expect(loginWithApiKeySpy).toHaveBeenCalledWith('rev_test_key');
      expect(meSpy).toHaveBeenCalled();
      expect(result).toBe('key-owner');
    });

    it('does not call loginWithToken for apikey auth', async () => {
      const loginWithTokenSpy = jest.spyOn(apiClient.client, 'loginWithToken');
      jest
        .spyOn(apiClient.client, 'loginWithApiKey')
        .mockImplementation(() => {});
      jest
        .spyOn(apiClient.client, 'me')
        .mockResolvedValue({ username: 'user' } as MeModel);

      await apiClient.authenticate({
        method: 'apikey',
        apikey: 'rev_test_key',
      });

      expect(loginWithTokenSpy).not.toHaveBeenCalled();
    });

    it('returns "service account" when me() fails (service key)', async () => {
      jest
        .spyOn(apiClient.client, 'loginWithApiKey')
        .mockImplementation(() => {});
      jest
        .spyOn(apiClient.client, 'me')
        .mockRejectedValue(new Error('Unauthorized'));

      const result = await apiClient.authenticate({
        method: 'apikey',
        apikey: 'rev_service_key',
      });

      expect(result).toBe('service account');
    });

    it('returns "authenticated user" when me() returns empty username', async () => {
      jest
        .spyOn(apiClient.client, 'loginWithApiKey')
        .mockImplementation(() => {});
      jest
        .spyOn(apiClient.client, 'me')
        .mockResolvedValue({ username: '' } as MeModel);

      const result = await apiClient.authenticate({
        method: 'apikey',
        apikey: 'rev_test_key',
      });

      expect(result).toBe('authenticated user');
    });
  });

  describe('authenticateWithToken (via authenticate)', () => {
    it('sets bearer token on the underlying client', async () => {
      const setConfigSpy = jest.spyOn(apiClient.client.client, 'setConfig');
      const loginWithTokenSpy = jest
        .spyOn(apiClient.client, 'loginWithToken')
        .mockImplementation(() => {});
      jest
        .spyOn(apiClient.client, 'me')
        .mockResolvedValue({ username: 'token-user' } as MeModel);

      const result = await apiClient.authenticate({
        method: 'token',
        token: 'jwt-token-123',
      });

      expect(loginWithTokenSpy).not.toHaveBeenCalled();
      expect(setConfigSpy).toHaveBeenCalledWith({
        auth: undefined,
        headers: {
          Authorization: 'Bearer jwt-token-123',
        },
      });
      expect(result).toBe('token-user');
    });

    it('does not call loginWithApiKey for token auth', async () => {
      jest
        .spyOn(apiClient.client, 'loginWithToken')
        .mockImplementation(() => {});
      const loginWithApiKeySpy = jest.spyOn(
        apiClient.client,
        'loginWithApiKey',
      );
      jest
        .spyOn(apiClient.client, 'me')
        .mockResolvedValue({ username: 'user' } as MeModel);

      await apiClient.authenticate({
        method: 'token',
        token: 'jwt-token-123',
      });

      expect(loginWithApiKeySpy).not.toHaveBeenCalled();
    });
  });

  describe('authenticateWithPassword (via authenticate)', () => {
    it('logs in and stores the returned access token as bearer auth', async () => {
      const setConfigSpy = jest.spyOn(apiClient.client.client, 'setConfig');
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            accessToken: 'jwt-from-login',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      const result = await apiClient.authenticate({
        method: 'password',
        username: 'admin',
        password: 'admin',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emailOrUsername: 'admin',
            password: 'admin',
          }),
        }),
      );
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(setConfigSpy).toHaveBeenCalledWith({
        auth: undefined,
        headers: {
          Authorization: 'Bearer jwt-from-login',
        },
      });
      expect(result).toBe('admin');
    });

    it('maps an aborted login request to a timeout error', async () => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      jest.spyOn(global, 'fetch').mockRejectedValue(abortError);

      await expect(
        apiClient.authenticate({
          method: 'password',
          username: 'admin',
          password: 'admin',
        }),
      ).rejects.toThrow('Login request timed out after 10000ms');
    });

    it('rejects malformed login JSON', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response('not-json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(
        apiClient.authenticate({
          method: 'password',
          username: 'admin',
          password: 'admin',
        }),
      ).rejects.toThrow('Invalid login response: expected JSON');
    });

    it('rejects login responses without an access token', async () => {
      const setConfigSpy = jest.spyOn(apiClient.client.client, 'setConfig');
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ accessToken: '' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(
        apiClient.authenticate({
          method: 'password',
          username: 'admin',
          password: 'admin',
        }),
      ).rejects.toThrow('Invalid login response: missing accessToken');
      expect(setConfigSpy).not.toHaveBeenCalled();
    });
  });

  describe('authenticate validation', () => {
    it('throws when token method has no token', async () => {
      await expect(
        apiClient.authenticate({
          method: 'token',
        } as AuthCredentials),
      ).rejects.toThrow('Token is required for token authentication');
    });

    it('throws when apikey method has no apikey', async () => {
      await expect(
        apiClient.authenticate({
          method: 'apikey',
        } as AuthCredentials),
      ).rejects.toThrow('API key is required for apikey authentication');
    });
  });
});
