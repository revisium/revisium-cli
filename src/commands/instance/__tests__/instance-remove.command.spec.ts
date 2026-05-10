import { InstanceRemoveCommand } from '../instance-remove.command';
import { LoggerService } from 'src/services/common';
import { CredentialStoreService } from 'src/services/credentials';
import { WorkspaceConfigService } from 'src/services/workspace';

describe('InstanceRemoveCommand', () => {
  let workspaceConfig: { load: jest.Mock; save: jest.Mock };
  let credentialStore: { deleteCredential: jest.Mock };
  let logger: { info: jest.Mock; success: jest.Mock };
  let command: InstanceRemoveCommand;

  beforeEach(() => {
    workspaceConfig = {
      load: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    credentialStore = { deleteCredential: jest.fn() };
    logger = { info: jest.fn(), success: jest.fn() };
    command = new InstanceRemoveCommand(
      workspaceConfig as unknown as WorkspaceConfigService,
      credentialStore as unknown as CredentialStoreService,
      logger as unknown as LoggerService,
    );
  });

  function loaded(
    instances: Record<string, { baseUrl: string }>,
    contexts: Record<string, { instance: string }> = {},
  ): void {
    workspaceConfig.load.mockResolvedValue({
      path: '/repo/.revisium/revisium-cli.config.json',
      config: { version: 1, instances, contexts },
    });
  }

  it('removes a known instance', async () => {
    loaded({ local: { baseUrl: 'http://a' } });
    await command.run(['local'], {});
    expect(workspaceConfig.save).toHaveBeenCalledWith(
      '/repo/.revisium/revisium-cli.config.json',
      expect.objectContaining({ instances: {} }),
    );
    expect(credentialStore.deleteCredential).not.toHaveBeenCalled();
    expect(logger.success).toHaveBeenCalledWith('Removed instance "local"');
  });

  it('rejects when name is missing', async () => {
    await expect(command.run([], {})).rejects.toThrow(
      'instance name is required',
    );
  });

  it('rejects an unknown instance', async () => {
    loaded({});
    await expect(command.run(['ghost'], {})).rejects.toThrow(
      'Revisium instance "ghost" was not found',
    );
  });

  it('rejects when contexts still reference the instance', async () => {
    loaded(
      { local: { baseUrl: 'http://a' } },
      { dictionary: { instance: 'local' } },
    );
    await expect(command.run(['local'], {})).rejects.toThrow(
      /used by contexts: dictionary/,
    );
    expect(workspaceConfig.save).not.toHaveBeenCalled();
  });

  it('--with-credentials deletes the saved default credential', async () => {
    loaded({ local: { baseUrl: 'http://a' } });
    credentialStore.deleteCredential.mockReturnValue(true);
    await command.run(['local'], { withCredentials: true });
    expect(credentialStore.deleteCredential).toHaveBeenCalledWith({
      baseUrl: 'http://a',
      credential: 'default',
    });
    expect(logger.info).toHaveBeenCalledWith(
      'Removed saved credential for "local"',
    );
  });

  it('--with-credentials no-ops silently when there was no saved credential', async () => {
    loaded({ local: { baseUrl: 'http://a' } });
    credentialStore.deleteCredential.mockReturnValue(false);
    await command.run(['local'], { withCredentials: true });
    expect(credentialStore.deleteCredential).toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Removed saved credential'),
    );
  });

  it('parseWithCredentials parses boolean option', () => {
    expect(command.parseWithCredentials()).toBe(true);
    expect(command.parseWithCredentials('false')).toBe(false);
  });
});
