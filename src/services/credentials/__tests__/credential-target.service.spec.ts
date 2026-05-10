import { CredentialTargetService } from '../credential-target.service';
import { WorkspaceConfigService } from '../../workspace';

describe('CredentialTargetService', () => {
  let workspaceConfig: {
    load: jest.Mock;
    normalizeBaseUrl: jest.Mock;
    findInstanceNameByBaseUrl: jest.Mock;
  };
  let service: CredentialTargetService;

  beforeEach(() => {
    workspaceConfig = {
      load: jest.fn(),
      normalizeBaseUrl: jest.fn(),
      findInstanceNameByBaseUrl: jest.fn(),
    };
    service = new CredentialTargetService(
      workspaceConfig as unknown as WorkspaceConfigService,
    );
  });

  it('resolves explicit instance targets from workspace config', async () => {
    workspaceConfig.load.mockResolvedValue({
      path: '/repo/.revisium/revisium-cli.config.json',
      config: {
        version: 1,
        currentContext: 'dictionary',
        instances: {
          cloud: {
            baseUrl: 'https://cloud.revisium.io',
            authMode: 'stored',
          },
        },
        contexts: {},
      },
    });

    await expect(
      service.resolveRequired({
        instance: 'cloud',
        credential: 'admin',
      }),
    ).resolves.toEqual({
      baseUrl: 'https://cloud.revisium.io',
      credential: 'admin',
      instanceName: 'cloud',
      authMode: 'stored',
      configPath: '/repo/.revisium/revisium-cli.config.json',
    });
  });

  it('resolves URL targets and attaches matching instance metadata when available', async () => {
    workspaceConfig.normalizeBaseUrl.mockReturnValue(
      'https://cloud.revisium.io',
    );
    workspaceConfig.findInstanceNameByBaseUrl.mockReturnValue('cloud');
    workspaceConfig.load.mockResolvedValue({
      path: '/repo/.revisium/revisium-cli.config.json',
      config: {
        version: 1,
        instances: {
          cloud: {
            baseUrl: 'https://cloud.revisium.io',
            authMode: 'none',
          },
        },
        contexts: {},
      },
    });

    await expect(
      service.resolveRequired({
        url: 'revisium://cloud.revisium.io/admin/dictionary/master',
      }),
    ).resolves.toEqual({
      baseUrl: 'https://cloud.revisium.io',
      credential: 'default',
      instanceName: 'cloud',
      authMode: 'none',
      configPath: '/repo/.revisium/revisium-cli.config.json',
    });
  });

  it('uses the current context when status/logout omit target selectors', async () => {
    workspaceConfig.load.mockResolvedValue({
      path: '/repo/.revisium/revisium-cli.config.json',
      config: {
        version: 1,
        currentContext: 'dictionary',
        instances: {
          cloud: {
            baseUrl: 'https://cloud.revisium.io',
            authMode: 'stored',
          },
        },
        contexts: {
          dictionary: {
            instance: 'cloud',
            credential: 'admin',
            organization: 'admin',
            project: 'dictionary',
          },
        },
      },
    });

    await expect(service.resolveOrCurrentContext({})).resolves.toEqual({
      baseUrl: 'https://cloud.revisium.io',
      credential: 'admin',
      instanceName: 'cloud',
      contextName: 'dictionary',
      authMode: 'stored',
      configPath: '/repo/.revisium/revisium-cli.config.json',
    });
  });

  it('rejects ambiguous target selectors', async () => {
    await expect(
      service.resolveRequired({
        url: 'revisium://cloud.revisium.io',
        instance: 'cloud',
      }),
    ).rejects.toThrow('Use only one target selector: --instance or --url');
  });
});
