import type { MeModel } from '@revisium/client';
import { RevisiumApiClient } from '../api-client';
import type { AuthCredentials } from '../../url';

describe('RevisiumApiClient', () => {
  let apiClient: RevisiumApiClient;

  beforeEach(() => {
    apiClient = new RevisiumApiClient('http://localhost:8080');
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
    it('calls loginWithToken on the underlying client', async () => {
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

      expect(loginWithTokenSpy).toHaveBeenCalledWith('jwt-token-123');
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
