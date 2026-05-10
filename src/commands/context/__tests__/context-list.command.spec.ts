import { ContextListCommand } from '../context-list.command';
import { LoggerService } from 'src/services/common';
import { WorkspaceConfigService } from 'src/services/workspace';

describe('ContextListCommand', () => {
  let workspaceConfig: { load: jest.Mock };
  let logger: { info: jest.Mock };
  let command: ContextListCommand;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    workspaceConfig = { load: jest.fn() };
    logger = { info: jest.fn() };
    command = new ContextListCommand(
      workspaceConfig as unknown as WorkspaceConfigService,
      logger as unknown as LoggerService,
    );
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('prints "no contexts configured" when workspace is empty', async () => {
    workspaceConfig.load.mockResolvedValue(undefined);
    await command.run([], {});
    expect(logger.info).toHaveBeenCalledWith(
      'No Revisium contexts configured in this workspace.',
    );
  });

  it('lists contexts sorted by name with a current-context marker', async () => {
    workspaceConfig.load.mockResolvedValue({
      path: '/repo/.revisium/revisium-cli.config.json',
      config: {
        currentContext: 'beta',
        contexts: {
          beta: { instance: 'local', organization: 'admin', project: 'b' },
          alpha: { instance: 'local', organization: 'admin', project: 'a' },
        },
      },
    });
    await command.run([], {});
    const lines = logger.info.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(lines.find((l) => l.startsWith('  alpha\t'))).toBeDefined();
    expect(lines.find((l) => l.startsWith('* beta\t'))).toBeDefined();
  });

  it('emits JSON with all parts and current flag', async () => {
    workspaceConfig.load.mockResolvedValue({
      path: '/repo/.revisium/revisium-cli.config.json',
      config: {
        currentContext: 'alpha',
        contexts: {
          alpha: {
            instance: 'local',
            organization: 'admin',
            project: 'p',
            branch: 'master',
            revision: 'draft',
            credential: 'default',
          },
        },
      },
    });
    await command.run([], { json: true });
    const firstCall = logSpy.mock.calls[0] as unknown[];
    const payload = JSON.parse(firstCall[0] as string) as {
      currentContext: string;
      contexts: Array<{ name: string; current: boolean }>;
    };
    expect(payload.currentContext).toBe('alpha');
    expect(payload.contexts).toEqual([
      {
        name: 'alpha',
        instance: 'local',
        organization: 'admin',
        project: 'p',
        branch: 'master',
        revision: 'draft',
        credential: 'default',
        current: true,
      },
    ]);
  });

  it('emits JSON with empty list when workspace is unconfigured', async () => {
    workspaceConfig.load.mockResolvedValue(undefined);
    await command.run([], { json: true });
    const firstCall = logSpy.mock.calls[0] as unknown[];
    const payload = JSON.parse(firstCall[0] as string) as {
      contexts: unknown[];
    };
    expect(payload.contexts).toEqual([]);
  });

  it('parseJson honours boolean values', () => {
    expect(command.parseJson()).toBe(true);
    expect(command.parseJson('false')).toBe(false);
  });
});
