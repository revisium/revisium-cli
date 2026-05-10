import { InstanceAddCommand } from '../instance-add.command';
import { LoggerService } from 'src/services/common';
import { WorkspaceConfigService } from 'src/services/workspace';

describe('InstanceAddCommand', () => {
  let workspaceConfig: {
    loadOrCreate: jest.Mock;
    save: jest.Mock;
    normalizeBaseUrl: jest.Mock;
  };
  let logger: { info: jest.Mock; success: jest.Mock };
  let command: InstanceAddCommand;

  beforeEach(() => {
    workspaceConfig = {
      loadOrCreate: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      normalizeBaseUrl: jest.fn((u: string) => u),
    };
    logger = { info: jest.fn(), success: jest.fn() };
    command = new InstanceAddCommand(
      workspaceConfig as unknown as WorkspaceConfigService,
      logger as unknown as LoggerService,
    );
  });

  function loadedWith(instances: Record<string, unknown> = {}): void {
    workspaceConfig.loadOrCreate.mockResolvedValue({
      path: '/repo/.revisium/revisium-cli.config.json',
      config: { version: 1, instances, contexts: {} },
    });
  }

  it('adds a new instance with default authMode "stored"', async () => {
    loadedWith({});
    await command.run(['local'], { url: 'revisium://localhost:9222' });
    expect(workspaceConfig.save).toHaveBeenCalledWith(
      '/repo/.revisium/revisium-cli.config.json',
      expect.objectContaining({
        instances: {
          local: { baseUrl: 'revisium://localhost:9222', authMode: 'stored' },
        },
      }),
    );
    expect(logger.success).toHaveBeenCalledWith(
      'Added instance "local" (revisium://localhost:9222, auth: stored)',
    );
  });

  it('rejects re-adding an existing instance without --force', async () => {
    loadedWith({ local: { baseUrl: 'http://existing', authMode: 'stored' } });
    await expect(
      command.run(['local'], { url: 'revisium://localhost:9222' }),
    ).rejects.toThrow(/already exists.*--force/);
    expect(workspaceConfig.save).not.toHaveBeenCalled();
  });

  it('overwrites with --force', async () => {
    loadedWith({ local: { baseUrl: 'http://existing', authMode: 'stored' } });
    await command.run(['local'], {
      url: 'revisium://localhost:9230',
      force: true,
    });
    expect(workspaceConfig.save).toHaveBeenCalled();
    expect(logger.success).toHaveBeenCalledWith(
      'Updated instance "local" (revisium://localhost:9230, auth: stored)',
    );
  });

  it('rejects when name is missing', async () => {
    await expect(
      command.run([], { url: 'revisium://localhost:9222' }),
    ).rejects.toThrow('instance name is required');
  });

  it('rejects when --url is missing', async () => {
    await expect(command.run(['local'], {})).rejects.toThrow(
      '--url option is required',
    );
  });

  it('parseAuth accepts stored/none and rejects other values', () => {
    expect(command.parseAuth('stored')).toBe('stored');
    expect(command.parseAuth('none')).toBe('none');
    expect(() => command.parseAuth('weird')).toThrow();
  });

  it('parseForce parses boolean option', () => {
    expect(command.parseForce()).toBe(true);
    expect(command.parseForce('true')).toBe(true);
    expect(command.parseForce('false')).toBe(false);
  });
});
