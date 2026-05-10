import { AuthLoginCommand } from '../auth-login.command';
import {
  CredentialStoreService,
  CredentialTargetService,
} from 'src/services/credentials';
import { InteractiveService, LoggerService } from 'src/services/common';

describe('AuthLoginCommand', () => {
  let credentialTargets: { resolveRequired: jest.Mock };
  let credentialStore: { saveApiKey: jest.Mock };
  let interactive: { promptPassword: jest.Mock };
  let logger: { success: jest.Mock };
  let command: AuthLoginCommand;

  beforeEach(() => {
    credentialTargets = {
      resolveRequired: jest.fn().mockResolvedValue({
        baseUrl: 'https://cloud.revisium.io',
        credential: 'admin',
        instanceName: 'cloud',
        authMode: 'stored',
      }),
    };
    credentialStore = {
      saveApiKey: jest.fn(),
    };
    interactive = {
      promptPassword: jest.fn().mockResolvedValue(' rev_prompt '),
    };
    logger = {
      success: jest.fn(),
    };
    command = new AuthLoginCommand(
      credentialTargets as unknown as CredentialTargetService,
      credentialStore as unknown as CredentialStoreService,
      interactive as unknown as InteractiveService,
      logger as unknown as LoggerService,
    );
  });

  it('prompts for an API key and saves it for the resolved target', async () => {
    await command.run([], {
      instance: 'cloud',
      credential: 'admin',
      apiKey: true,
    });

    expect(interactive.promptPassword).toHaveBeenCalledWith(
      'Enter Revisium API key:',
    );
    expect(credentialStore.saveApiKey).toHaveBeenCalledWith(
      {
        baseUrl: 'https://cloud.revisium.io',
        credential: 'admin',
      },
      'rev_prompt',
    );
    expect(logger.success).toHaveBeenCalledWith(
      'Saved API key credential "admin" for instance "cloud" (https://cloud.revisium.io)',
    );
  });

  it('rejects authMode none targets unless force is set', async () => {
    credentialTargets.resolveRequired.mockResolvedValue({
      baseUrl: 'http://localhost:9222',
      credential: 'default',
      instanceName: 'local',
      authMode: 'none',
    });

    await expect(
      command.run([], {
        instance: 'local',
        apiKey: true,
      }),
    ).rejects.toThrow('uses authMode "none"');

    expect(credentialStore.saveApiKey).not.toHaveBeenCalled();
  });

  it('allows forced saves for authMode none targets', async () => {
    credentialTargets.resolveRequired.mockResolvedValue({
      baseUrl: 'http://localhost:9222',
      credential: 'default',
      instanceName: 'local',
      authMode: 'none',
    });

    await command.run([], {
      instance: 'local',
      apiKey: true,
      force: true,
    });

    expect(credentialStore.saveApiKey).toHaveBeenCalledWith(
      {
        baseUrl: 'http://localhost:9222',
        credential: 'default',
      },
      'rev_prompt',
    );
  });

  it('requires one API key input mode', async () => {
    await expect(
      command.run([], {
        instance: 'cloud',
      }),
    ).rejects.toThrow('Pass --api-key to prompt, or --api-key-stdin');

    await expect(
      command.run([], {
        instance: 'cloud',
        apiKey: true,
        apiKeyStdin: true,
      }),
    ).rejects.toThrow('Use only one credential input');
  });

  it('parses command options', () => {
    expect(command.parseUrl('revisium://cloud.revisium.io')).toBe(
      'revisium://cloud.revisium.io',
    );
    expect(command.parseInstance('cloud')).toBe('cloud');
    expect(command.parseCredential('admin')).toBe('admin');
    expect(command.parseApiKey()).toBe(true);
    expect(command.parseApiKeyStdin()).toBe(true);
    expect(command.parseForce()).toBe(true);
    expect(command.parseForce('false')).toBe(false);
  });
});
