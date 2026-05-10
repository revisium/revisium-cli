import { AuthStatusCommand } from '../auth-status.command';
import {
  CredentialStoreService,
  CredentialTargetService,
} from 'src/services/credentials';
import { LoggerService } from 'src/services/common';

describe('AuthStatusCommand', () => {
  let credentialTargets: { resolveOrCurrentContext: jest.Mock };
  let credentialStore: { hasCredential: jest.Mock };
  let logger: {
    info: jest.Mock;
    success: jest.Mock;
    warn: jest.Mock;
  };
  let command: AuthStatusCommand;

  beforeEach(() => {
    credentialTargets = {
      resolveOrCurrentContext: jest.fn().mockResolvedValue({
        baseUrl: 'https://cloud.revisium.io',
        credential: 'admin',
        instanceName: 'cloud',
        contextName: 'dictionary',
        authMode: 'stored',
      }),
    };
    credentialStore = {
      hasCredential: jest.fn().mockReturnValue(true),
    };
    logger = {
      info: jest.fn(),
      success: jest.fn(),
      warn: jest.fn(),
    };
    command = new AuthStatusCommand(
      credentialTargets as unknown as CredentialTargetService,
      credentialStore as unknown as CredentialStoreService,
      logger as unknown as LoggerService,
    );
  });

  it('prints saved credential status for the current context', async () => {
    await command.run([], {});

    expect(credentialTargets.resolveOrCurrentContext).toHaveBeenCalledWith({});
    expect(credentialStore.hasCredential).toHaveBeenCalledWith({
      baseUrl: 'https://cloud.revisium.io',
      credential: 'admin',
    });
    expect(logger.info).toHaveBeenCalledWith('Context: dictionary');
    expect(logger.info).toHaveBeenCalledWith('Instance: cloud');
    expect(logger.info).toHaveBeenCalledWith(
      'Base URL: https://cloud.revisium.io',
    );
    expect(logger.info).toHaveBeenCalledWith('Credential: admin');
    expect(logger.info).toHaveBeenCalledWith('Auth mode: stored');
    expect(logger.success).toHaveBeenCalledWith('Saved credential found');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('prints a login hint when the target has no saved credential', async () => {
    credentialTargets.resolveOrCurrentContext.mockResolvedValue({
      baseUrl: 'https://cloud.revisium.io',
      credential: 'default',
      authMode: 'stored',
    });
    credentialStore.hasCredential.mockReturnValue(false);

    await command.run([], {
      url: 'revisium://cloud.revisium.io/admin/dictionary/master',
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'No saved credential found. Run: revisium auth login --url "revisium://cloud.revisium.io" --credential "default" --api-key',
    );
  });

  it('does not read the credential store for authMode none targets', async () => {
    credentialTargets.resolveOrCurrentContext.mockResolvedValue({
      baseUrl: 'http://localhost:9222',
      credential: 'default',
      instanceName: 'local',
      authMode: 'none',
    });

    await command.run([], {
      instance: 'local',
    });

    expect(logger.info).toHaveBeenCalledWith(
      'Saved credentials are bypassed for authMode "none".',
    );
    expect(credentialStore.hasCredential).not.toHaveBeenCalled();
    expect(logger.success).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('parses command options', () => {
    expect(command.parseUrl('revisium://cloud.revisium.io')).toBe(
      'revisium://cloud.revisium.io',
    );
    expect(command.parseInstance('cloud')).toBe('cloud');
    expect(command.parseCredential('admin')).toBe('admin');
  });
});
