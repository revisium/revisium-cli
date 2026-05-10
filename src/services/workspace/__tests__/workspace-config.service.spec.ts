import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkspaceConfigService } from '../workspace-config.service';
import { UrlParserService } from '../../url/url-parser.service';
import { CredentialStoreService } from '../../credentials';

describe('WorkspaceConfigService', () => {
  let service: WorkspaceConfigService;
  let tempDir: string;

  beforeEach(async () => {
    service = new WorkspaceConfigService(new UrlParserService());
    tempDir = await mkdtemp(join(tmpdir(), 'revisium-cli-workspace-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes and discovers the nearest workspace config from a child folder', async () => {
    const loaded = await service.loadOrCreate(tempDir);
    loaded.config.instances.local = {
      baseUrl: 'http://localhost:9222',
      authMode: 'none',
    };
    await service.save(loaded.path, loaded.config);

    const childDir = join(tempDir, 'examples', 'dictionary');
    await mkdir(childDir, { recursive: true });

    const discovered = await service.load(childDir);

    expect(discovered?.path).toBe(loaded.path);
    expect(discovered?.config.instances.local).toEqual({
      baseUrl: 'http://localhost:9222',
      authMode: 'none',
    });
  });

  it('normalizes revisium URLs to server base URLs', () => {
    expect(
      service.normalizeBaseUrl('revisium://localhost:9222/admin/proj'),
    ).toBe('http://localhost:9222');
    expect(service.normalizeBaseUrl('https://cloud.revisium.io/')).toBe(
      'https://cloud.revisium.io',
    );
  });

  it('rejects direct http instance URLs with missing host or extra target path', () => {
    expect(() => service.normalizeBaseUrl('https://')).toThrow(
      'Use http(s)://host[:port]',
    );
    expect(() =>
      service.normalizeBaseUrl('https://cloud.revisium.io/admin/dictionary'),
    ).toThrow('Use http(s)://host[:port]');
    expect(() =>
      service.normalizeBaseUrl('https://cloud.revisium.io?token=secret'),
    ).toThrow('Use http(s)://host[:port]');
  });

  it('parses context URLs with default branch and revision', () => {
    expect(
      service.parseContextUrl('revisium://localhost:9222/admin/dictionary'),
    ).toEqual({
      baseUrl: 'http://localhost:9222',
      organization: 'admin',
      project: 'dictionary',
      branch: 'master',
      revision: 'draft',
    });
  });

  it('resolves no-auth workspace contexts', () => {
    const url = service.resolveConnection(
      {
        path: join(tempDir, '.revisium', 'revisium-cli.config.json'),
        config: {
          version: 1,
          currentContext: 'dictionary-local',
          instances: {
            local: {
              baseUrl: 'http://localhost:9222',
              authMode: 'none',
            },
          },
          contexts: {
            'dictionary-local': {
              instance: 'local',
              organization: 'admin',
              project: 'dictionary',
            },
          },
        },
      },
      undefined,
      {},
    );

    expect(url).toEqual({
      baseUrl: 'http://localhost:9222',
      auth: { method: 'none' },
      organization: 'admin',
      project: 'dictionary',
      branch: 'master',
      revision: 'draft',
    });
  });

  it('loads an existing context with its config path', async () => {
    const loaded = await service.loadOrCreate(tempDir);
    loaded.config.contexts.demo = {
      instance: 'local',
      organization: 'admin',
      project: 'dictionary',
    };
    await service.save(loaded.path, loaded.config);

    const result = await service.loadContext('demo', tempDir);

    expect(result.loaded.path).toBe(loaded.path);
    expect(result.context.project).toBe('dictionary');
  });

  it('fails when loading a missing context', async () => {
    const loaded = await service.loadOrCreate(tempDir);
    await service.save(loaded.path, loaded.config);

    await expect(service.loadContext('missing', tempDir)).rejects.toThrow(
      'Revisium context "missing" was not found',
    );
  });

  it('lets environment credentials override no-auth mode', () => {
    const url = service.resolveConnection(
      {
        path: join(tempDir, '.revisium', 'revisium-cli.config.json'),
        config: {
          version: 1,
          currentContext: 'dictionary-local',
          instances: {
            local: {
              baseUrl: 'http://localhost:9222',
              authMode: 'none',
            },
          },
          contexts: {
            'dictionary-local': {
              instance: 'local',
              organization: 'admin',
              project: 'dictionary',
            },
          },
        },
      },
      undefined,
      { apikey: 'rev_test' },
    );

    expect(url.auth).toEqual({ method: 'apikey', apikey: 'rev_test' });
  });

  it('resolves saved credentials for stored workspace contexts', () => {
    const credentialStore = {
      getCredential: jest
        .fn()
        .mockReturnValue({ method: 'apikey', apikey: 'rev_saved' }),
    } as unknown as CredentialStoreService;
    service = new WorkspaceConfigService(
      new UrlParserService(),
      credentialStore,
    );

    const url = service.resolveConnection(
      {
        path: join(tempDir, '.revisium', 'revisium-cli.config.json'),
        config: {
          version: 1,
          currentContext: 'cloud',
          instances: {
            cloud: {
              baseUrl: 'https://cloud.revisium.io',
              authMode: 'stored',
            },
          },
          contexts: {
            cloud: {
              instance: 'cloud',
              credential: 'admin',
              organization: 'admin',
              project: 'dictionary',
            },
          },
        },
      },
      undefined,
      {},
    );

    expect(url.auth).toEqual({ method: 'apikey', apikey: 'rev_saved' });
    expect(credentialStore.getCredential).toHaveBeenCalledWith({
      baseUrl: 'https://cloud.revisium.io',
      credential: 'admin',
    });
  });

  it('lets environment credentials override saved credentials', () => {
    const credentialStore = {
      getCredential: jest.fn(),
    } as unknown as CredentialStoreService;
    service = new WorkspaceConfigService(
      new UrlParserService(),
      credentialStore,
    );

    const url = service.resolveConnection(
      {
        path: join(tempDir, '.revisium', 'revisium-cli.config.json'),
        config: {
          version: 1,
          currentContext: 'cloud',
          instances: {
            cloud: {
              baseUrl: 'https://cloud.revisium.io',
              authMode: 'stored',
            },
          },
          contexts: {
            cloud: {
              instance: 'cloud',
              credential: 'admin',
              organization: 'admin',
              project: 'dictionary',
            },
          },
        },
      },
      undefined,
      { apikey: 'rev_env' },
    );

    expect(url.auth).toEqual({ method: 'apikey', apikey: 'rev_env' });
    expect(credentialStore.getCredential).not.toHaveBeenCalled();
  });

  it('fails with remediation when stored credentials cannot be read', () => {
    const credentialStore = {
      getCredential: jest.fn(() => {
        throw new Error(
          'Could not read Revisium credential "admin" for https://cloud.revisium.io: keyring unavailable',
        );
      }),
    } as unknown as CredentialStoreService;
    service = new WorkspaceConfigService(
      new UrlParserService(),
      credentialStore,
    );

    expect(() =>
      service.resolveConnection(
        {
          path: join(tempDir, '.revisium', 'revisium-cli.config.json'),
          config: {
            version: 1,
            currentContext: 'cloud',
            instances: {
              cloud: {
                baseUrl: 'https://cloud.revisium.io',
                authMode: 'stored',
              },
            },
            contexts: {
              cloud: {
                instance: 'cloud',
                credential: 'admin',
                organization: 'admin',
                project: 'dictionary',
              },
            },
          },
        },
        undefined,
        {},
      ),
    ).toThrow(
      'No credentials found for context "cloud" credential "admin". Could not read the OS credential store',
    );
  });

  it('fails with remediation when stored credentials are required', () => {
    expect(() =>
      service.resolveConnection(
        {
          path: join(tempDir, '.revisium', 'revisium-cli.config.json'),
          config: {
            version: 1,
            currentContext: 'cloud',
            instances: {
              cloud: {
                baseUrl: 'https://cloud.revisium.io',
                authMode: 'stored',
              },
            },
            contexts: {
              cloud: {
                instance: 'cloud',
                credential: 'admin',
                organization: 'admin',
                project: 'dictionary',
              },
            },
          },
        },
        undefined,
        {},
      ),
    ).toThrow(
      'No credentials found for context "cloud" credential "admin". Run: revisium auth login --instance cloud --credential admin --api-key.',
    );
  });

  it('rejects malformed config files', async () => {
    const configPath = service.getDefaultConfigPath(tempDir);
    await mkdir(join(tempDir, '.revisium'), { recursive: true });
    await writeFile(configPath, '{"version":2}', 'utf-8');

    await expect(service.load(tempDir)).rejects.toThrow(
      'unsupported version 2',
    );
  });

  it('normalizes instance base URLs when loading config files', async () => {
    const configPath = service.getDefaultConfigPath(tempDir);
    await mkdir(join(tempDir, '.revisium'), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        instances: {
          cloud: {
            baseUrl: 'https://cloud.revisium.io/',
            authMode: 'stored',
          },
        },
        contexts: {},
      }),
      'utf-8',
    );

    const loaded = await service.load(tempDir);

    expect(loaded?.config.instances.cloud.baseUrl).toBe(
      'https://cloud.revisium.io',
    );
  });

  it('writes only the workspace config file when saving', async () => {
    const loaded = await service.loadOrCreate(tempDir);
    loaded.config.instances.local = {
      baseUrl: 'http://localhost:9222',
      authMode: 'none',
    };

    await service.save(loaded.path, loaded.config);

    const raw = await readFile(loaded.path, 'utf-8');
    expect(JSON.parse(raw)).toEqual({
      version: 1,
      instances: {
        local: {
          baseUrl: 'http://localhost:9222',
          authMode: 'none',
        },
      },
      contexts: {},
    });
  });
});
