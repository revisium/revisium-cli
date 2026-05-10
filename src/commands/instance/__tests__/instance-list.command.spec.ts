import { InstanceListCommand } from '../instance-list.command';
import { LoggerService } from 'src/services/common';
import { WorkspaceConfigService } from 'src/services/workspace';

describe('InstanceListCommand', () => {
  let workspaceConfig: { load: jest.Mock };
  let logger: { info: jest.Mock };
  let command: InstanceListCommand;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    workspaceConfig = { load: jest.fn() };
    logger = { info: jest.fn() };
    command = new InstanceListCommand(
      workspaceConfig as unknown as WorkspaceConfigService,
      logger as unknown as LoggerService,
    );
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('prints "no instances configured" when workspace is empty', async () => {
    workspaceConfig.load.mockResolvedValue(undefined);
    await command.run([], {});
    expect(logger.info).toHaveBeenCalledWith(
      'No Revisium instances configured in this workspace.',
    );
  });

  it('lists instances sorted by name', async () => {
    workspaceConfig.load.mockResolvedValue({
      path: '/repo/.revisium/revisium-cli.config.json',
      config: {
        instances: {
          beta: { baseUrl: 'http://b', authMode: 'stored' },
          alpha: { baseUrl: 'http://a', authMode: 'none' },
        },
      },
    });
    await command.run([], {});
    const callTexts = logger.info.mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    const alphaIdx = callTexts.findIndex((t) => t.startsWith('alpha\t'));
    const betaIdx = callTexts.findIndex((t) => t.startsWith('beta\t'));
    expect(alphaIdx).toBeGreaterThanOrEqual(0);
    expect(betaIdx).toBeGreaterThan(alphaIdx);
  });

  it('emits JSON with sorted instances when --json is set', async () => {
    workspaceConfig.load.mockResolvedValue({
      path: '/repo/.revisium/revisium-cli.config.json',
      config: {
        instances: {
          beta: { baseUrl: 'http://b', authMode: 'stored' },
          alpha: { baseUrl: 'http://a' },
        },
      },
    });
    await command.run([], { json: true });
    const firstCall = logSpy.mock.calls[0] as unknown[];
    const payload = JSON.parse(firstCall[0] as string) as {
      instances: Array<{ name: string; baseUrl: string; authMode: string }>;
    };
    expect(payload).toEqual({
      instances: [
        { name: 'alpha', baseUrl: 'http://a', authMode: 'stored' },
        { name: 'beta', baseUrl: 'http://b', authMode: 'stored' },
      ],
    });
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('emits JSON with empty list when workspace is unconfigured', async () => {
    workspaceConfig.load.mockResolvedValue(undefined);
    await command.run([], { json: true });
    const firstCall = logSpy.mock.calls[0] as unknown[];
    const payload = JSON.parse(firstCall[0] as string) as {
      instances: unknown[];
    };
    expect(payload.instances).toEqual([]);
  });

  it('parseJson honours boolean values', () => {
    expect(command.parseJson()).toBe(true);
    expect(command.parseJson('false')).toBe(false);
  });
});
