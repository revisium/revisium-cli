import { CredentialStoreService } from '../credential-store.service';

const keyringEntries = new Map<string, string>();

jest.mock('@napi-rs/keyring', () => ({
  Entry: jest.fn().mockImplementation((service: string, account: string) => ({
    setPassword: jest.fn((password: string) => {
      keyringEntries.set(`${service}:${account}`, password);
    }),
    getPassword: jest.fn(() => {
      if (account.includes('credential:missing-code')) {
        const error = new Error('mock missing credential');
        Object.assign(error, { code: 'NoEntry' });
        throw error;
      }

      if (account.includes('credential:missing-name')) {
        const error = new Error('mock missing credential');
        error.name = 'NoEntry';
        throw error;
      }

      return keyringEntries.get(`${service}:${account}`) ?? null;
    }),
    deleteCredential: jest.fn(() => {
      if (account.includes('credential:missing-code')) {
        const error = new Error('mock missing credential');
        Object.assign(error, { code: 'NoEntry' });
        throw error;
      }

      return keyringEntries.delete(`${service}:${account}`);
    }),
  })),
}));

describe('CredentialStoreService', () => {
  let service: CredentialStoreService;
  const originalServiceName = process.env.REVISIUM_CREDENTIAL_STORE_SERVICE;

  beforeEach(() => {
    delete process.env.REVISIUM_CREDENTIAL_STORE_SERVICE;
    keyringEntries.clear();
    service = new CredentialStoreService();
  });

  afterAll(() => {
    if (originalServiceName === undefined) {
      delete process.env.REVISIUM_CREDENTIAL_STORE_SERVICE;
      return;
    }
    process.env.REVISIUM_CREDENTIAL_STORE_SERVICE = originalServiceName;
  });

  it('saves, reads, and deletes API key credentials by base URL and credential name', () => {
    const ref = {
      baseUrl: 'https://cloud.revisium.io',
      credential: 'admin',
    };

    service.saveApiKey(ref, ' rev_saved ');

    expect(service.hasCredential(ref)).toBe(true);
    expect(service.getCredential(ref)).toEqual({
      method: 'apikey',
      apikey: 'rev_saved',
    });
    expect(service.deleteCredential(ref)).toBe(true);
    expect(service.getCredential(ref)).toBeUndefined();
  });

  it('uses normalized base URL and credential name in the account key', () => {
    expect(
      service.getAccountName({
        baseUrl: 'https://cloud.revisium.io',
        credential: 'admin',
      }),
    ).toBe('instance:https://cloud.revisium.io|credential:admin');
  });

  it('rejects empty API keys before writing to the store', () => {
    expect(() =>
      service.saveApiKey(
        {
          baseUrl: 'https://cloud.revisium.io',
          credential: 'default',
        },
        ' ',
      ),
    ).toThrow('API key cannot be empty');
  });

  it('fails clearly when a saved credential has unsupported JSON', () => {
    const ref = {
      baseUrl: 'https://cloud.revisium.io',
      credential: 'default',
    };
    keyringEntries.set(
      `revisium-cli:${service.getAccountName(ref)}`,
      JSON.stringify({ method: 'token', token: 'jwt' }),
    );

    expect(() => service.getCredential(ref)).toThrow(
      'Saved Revisium credential "default" for https://cloud.revisium.io has an unsupported format',
    );
  });

  it('treats keyring NoEntry errors as missing credentials', () => {
    expect(
      service.getCredential({
        baseUrl: 'https://cloud.revisium.io',
        credential: 'missing-code',
      }),
    ).toBeUndefined();
    expect(
      service.getCredential({
        baseUrl: 'https://cloud.revisium.io',
        credential: 'missing-name',
      }),
    ).toBeUndefined();
    expect(
      service.deleteCredential({
        baseUrl: 'https://cloud.revisium.io',
        credential: 'missing-code',
      }),
    ).toBe(false);
  });
});
