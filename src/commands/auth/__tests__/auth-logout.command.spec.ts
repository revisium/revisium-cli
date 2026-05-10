import { AuthLogoutCommand } from '../auth-logout.command';
import {
  CredentialStoreService,
  CredentialTargetService,
} from 'src/services/credentials';
import { LoggerService } from 'src/services/common';

describe('AuthLogoutCommand', () => {
  let credentialTargets: { resolveOrCurrentContext: jest.Mock };
  let credentialStore: { deleteCredential: jest.Mock };
  let logger: {
    success: jest.Mock;
    warn: jest.Mock;
  };
  let command: AuthLogoutCommand;

  beforeEach(() => {
    credentialTargets = {
      resolveOrCurrentContext: jest.fn().mockResolvedValue({
        baseUrl: 'https://cloud.revisium.io',
        credential: 'admin',
        instanceName: 'cloud',
        authMode: 'stored',
      }),
    };
    credentialStore = {
      deleteCredential: jest.fn().mockReturnValue(true),
    };
    logger = {
      success: jest.fn(),
      warn: jest.fn(),
    };
    command = new AuthLogoutCommand(
      credentialTargets as unknown as CredentialTargetService,
      credentialStore as unknown as CredentialStoreService,
      logger as unknown as LoggerService,
    );
  });

  it('deletes a saved credential for the resolved target', async () => {
    await command.run([], {
      instance: 'cloud',
      credential: 'admin',
    });

    expect(credentialTargets.resolveOrCurrentContext).toHaveBeenCalledWith({
      instance: 'cloud',
      credential: 'admin',
    });
    expect(credentialStore.deleteCredential).toHaveBeenCalledWith({
      baseUrl: 'https://cloud.revisium.io',
      credential: 'admin',
    });
    expect(logger.success).toHaveBeenCalledWith(
      'Deleted saved credential "admin" for instance "cloud" (https://cloud.revisium.io)',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns when the resolved credential does not exist', async () => {
    credentialTargets.resolveOrCurrentContext.mockResolvedValue({
      baseUrl: 'https://cloud.revisium.io',
      credential: 'default',
      authMode: 'stored',
    });
    credentialStore.deleteCredential.mockReturnValue(false);

    await command.run([], {
      url: 'revisium://cloud.revisium.io',
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'No saved credential "default" found for https://cloud.revisium.io',
    );
    expect(logger.success).not.toHaveBeenCalled();
  });

  it('parses command options', () => {
    expect(command.parseUrl('revisium://cloud.revisium.io')).toBe(
      'revisium://cloud.revisium.io',
    );
    expect(command.parseInstance('cloud')).toBe('cloud');
    expect(command.parseCredential('admin')).toBe('admin');
  });
});
