import { Test, TestingModule } from '@nestjs/testing';
import { UrlBuilderService } from '../url-builder.service';
import { InteractiveService } from '../interactive.service';

describe('UrlBuilderService', () => {
  let service: UrlBuilderService;
  let interactiveService: jest.Mocked<InteractiveService>;

  beforeEach(async () => {
    const mockInteractive = {
      promptText: jest.fn(),
      promptPassword: jest.fn(),
      promptConfirm: jest.fn(),
      promptSelect: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlBuilderService,
        { provide: InteractiveService, useValue: mockInteractive },
      ],
    }).compile();

    service = module.get<UrlBuilderService>(UrlBuilderService);
    interactiveService = module.get(InteractiveService);
    jest.clearAllMocks();
  });

  describe('parse', () => {
    describe('revisium:// protocol', () => {
      it('parses full URL with credentials and branch', () => {
        const result = service.parse(
          'revisium://admin:secret@cloud.revisium.io/myorg/myproject/develop',
        );

        expect(result).toEqual({
          baseUrl: 'https://cloud.revisium.io',
          username: 'admin',
          password: 'secret',
          organization: 'myorg',
          project: 'myproject',
          branch: 'develop',
        });
      });

      it('parses URL with username only (no password)', () => {
        const result = service.parse(
          'revisium://admin@cloud.revisium.io/myorg/myproject/main',
        );

        expect(result).toEqual({
          baseUrl: 'https://cloud.revisium.io',
          username: 'admin',
          password: undefined,
          organization: 'myorg',
          project: 'myproject',
          branch: 'main',
        });
      });

      it('parses URL without credentials', () => {
        const result = service.parse(
          'revisium://cloud.revisium.io/myorg/myproject/main',
        );

        expect(result).toEqual({
          baseUrl: 'https://cloud.revisium.io',
          username: undefined,
          password: undefined,
          organization: 'myorg',
          project: 'myproject',
          branch: 'main',
        });
      });

      it('parses URL without branch', () => {
        const result = service.parse(
          'revisium://admin@cloud.revisium.io/myorg/myproject',
        );

        expect(result).toEqual({
          baseUrl: 'https://cloud.revisium.io',
          username: 'admin',
          password: undefined,
          organization: 'myorg',
          project: 'myproject',
          branch: undefined,
        });
      });

      it('parses localhost URL with port', () => {
        const result = service.parse(
          'revisium://admin:pass@localhost:8080/org/proj/main',
        );

        expect(result).toEqual({
          baseUrl: 'http://localhost:8080',
          username: 'admin',
          password: 'pass',
          organization: 'org',
          project: 'proj',
          branch: 'main',
        });
      });

      it('parses localhost URL without port', () => {
        const result = service.parse('revisium://localhost/org/proj');

        expect(result).toEqual({
          baseUrl: 'http://localhost',
          username: undefined,
          password: undefined,
          organization: 'org',
          project: 'proj',
          branch: undefined,
        });
      });

      it('parses 127.0.0.1 as http', () => {
        const result = service.parse('revisium://127.0.0.1:5173/org/proj/main');

        expect(result).toEqual({
          baseUrl: 'http://127.0.0.1:5173',
          username: undefined,
          password: undefined,
          organization: 'org',
          project: 'proj',
          branch: 'main',
        });
      });

      it('parses URL with custom port for remote host', () => {
        const result = service.parse(
          'revisium://staging.example.com:8443/org/proj',
        );

        expect(result).toEqual({
          baseUrl: 'https://staging.example.com:8443',
          username: undefined,
          password: undefined,
          organization: 'org',
          project: 'proj',
          branch: undefined,
        });
      });

      it('handles password with special characters', () => {
        const result = service.parse(
          'revisium://admin:p@ss:word@cloud.revisium.io/org/proj',
        );

        expect(result).toEqual({
          baseUrl: 'https://cloud.revisium.io',
          username: 'admin',
          password: 'p@ss:word',
          organization: 'org',
          project: 'proj',
          branch: undefined,
        });
      });
    });

    describe('plain host input', () => {
      it('returns empty baseUrl for plain host', () => {
        const result = service.parse('cloud.revisium.io');

        expect(result.baseUrl).toBe('');
        expect(result.organization).toBeUndefined();
      });

      it('returns empty baseUrl for empty input', () => {
        const result = service.parse('');

        expect(result.baseUrl).toBe('');
      });
    });
  });

  describe('parseAndComplete', () => {
    it('uses input URL and completes missing fields interactively', async () => {
      interactiveService.promptText.mockImplementation((message: string) => {
        if (message.includes('organization')) return Promise.resolve('myorg');
        if (message.includes('project')) return Promise.resolve('myproject');
        if (message.includes('branch')) return Promise.resolve('main');
        if (message.includes('username')) return Promise.resolve('admin');
        return Promise.resolve('');
      });
      interactiveService.promptPassword.mockResolvedValue('secret');
      interactiveService.promptSelect.mockResolvedValue('password');

      const result = await service.parseAndComplete(
        'revisium://cloud.revisium.io',
        'source',
      );

      expect(result.baseUrl).toBe('https://cloud.revisium.io');
      expect(result.organization).toBe('myorg');
      expect(result.project).toBe('myproject');
      expect(result.branch).toBe('main');
      expect(result.auth.method).toBe('password');
      expect(result.auth.username).toBe('admin');
      expect(result.auth.password).toBe('secret');
    });

    it('uses env.url when input is undefined', async () => {
      interactiveService.promptText.mockImplementation((message: string) => {
        if (message.includes('organization')) return Promise.resolve('org');
        if (message.includes('project')) return Promise.resolve('proj');
        if (message.includes('branch')) return Promise.resolve('main');
        if (message.includes('username')) return Promise.resolve('user');
        return Promise.resolve('');
      });
      interactiveService.promptPassword.mockResolvedValue('pass');

      const result = await service.parseAndComplete(undefined, 'source', {
        url: 'revisium://cloud.revisium.io/org/proj/main',
        username: 'envuser',
        password: 'envpass',
      });

      expect(result.baseUrl).toBe('https://cloud.revisium.io');
      expect(result.auth.method).toBe('password');
      expect(result.auth.username).toBe('envuser');
      expect(result.auth.password).toBe('envpass');
    });

    it('uses env credentials when not in URL', async () => {
      interactiveService.promptText.mockImplementation((message: string) => {
        if (message.includes('organization')) return Promise.resolve('org');
        if (message.includes('project')) return Promise.resolve('proj');
        if (message.includes('branch')) return Promise.resolve('main');
        return Promise.resolve('');
      });

      const result = await service.parseAndComplete(
        'revisium://cloud.revisium.io/org/proj/main',
        'source',
        { username: 'envuser', password: 'envpass' },
      );

      expect(result.auth.method).toBe('password');
      expect(result.auth.username).toBe('envuser');
      expect(result.auth.password).toBe('envpass');

      const promptTextCalls = interactiveService.promptText.mock.calls;
      const usernameCall = promptTextCalls.find((call) =>
        call[0].includes('username'),
      );
      expect(usernameCall).toBeUndefined();
      expect(interactiveService.promptPassword.mock.calls.length).toBe(0);
    });

    it('prefers URL credentials over env', async () => {
      const result = await service.parseAndComplete(
        'revisium://urluser:urlpass@cloud.revisium.io/org/proj/main',
        'source',
        { username: 'envuser', password: 'envpass' },
      );

      expect(result.auth.method).toBe('password');
      expect(result.auth.username).toBe('urluser');
      expect(result.auth.password).toBe('urlpass');
    });

    it('prompts for host when no input and no env', async () => {
      interactiveService.promptText.mockImplementation((message: string) => {
        if (message.includes('host'))
          return Promise.resolve('cloud.revisium.io');
        if (message.includes('organization')) return Promise.resolve('org');
        if (message.includes('project')) return Promise.resolve('proj');
        if (message.includes('branch')) return Promise.resolve('main');
        if (message.includes('username')) return Promise.resolve('admin');
        return Promise.resolve('');
      });
      interactiveService.promptPassword.mockResolvedValue('pass');
      interactiveService.promptConfirm.mockResolvedValue(true);
      interactiveService.promptSelect.mockResolvedValue('password');

      const result = await service.parseAndComplete(undefined, 'source');

      const promptTextCalls = interactiveService.promptText.mock.calls;
      const hostCall = promptTextCalls.find(
        (call) => call[0] === 'Enter source host:',
      );
      expect(hostCall).toBeDefined();
      expect(result.baseUrl).toBe('https://cloud.revisium.io');
    });

    it('asks for port when localhost without port', async () => {
      interactiveService.promptText.mockImplementation((message: string) => {
        if (message.includes('host')) return Promise.resolve('localhost');
        if (message.includes('port')) return Promise.resolve('5173');
        if (message.includes('organization')) return Promise.resolve('org');
        if (message.includes('project')) return Promise.resolve('proj');
        if (message.includes('branch')) return Promise.resolve('main');
        if (message.includes('username')) return Promise.resolve('admin');
        return Promise.resolve('');
      });
      interactiveService.promptPassword.mockResolvedValue('pass');
      interactiveService.promptSelect.mockResolvedValue('password');

      const result = await service.parseAndComplete(undefined, 'target');

      expect(result.baseUrl).toBe('http://localhost:5173');
    });

    it('asks for HTTPS confirmation for remote host', async () => {
      interactiveService.promptText.mockImplementation((message: string) => {
        if (message.includes('host'))
          return Promise.resolve('staging.example.com');
        if (message.includes('organization')) return Promise.resolve('org');
        if (message.includes('project')) return Promise.resolve('proj');
        if (message.includes('branch')) return Promise.resolve('main');
        if (message.includes('username')) return Promise.resolve('admin');
        return Promise.resolve('');
      });
      interactiveService.promptPassword.mockResolvedValue('pass');
      interactiveService.promptConfirm.mockResolvedValue(true);
      interactiveService.promptSelect.mockResolvedValue('password');

      const result = await service.parseAndComplete(undefined, 'source');

      const confirmCalls = interactiveService.promptConfirm.mock.calls;
      const httpsCall = confirmCalls.find(
        (call) => call[0] === 'Use HTTPS?' && call[1] === true,
      );
      expect(httpsCall).toBeDefined();
      expect(result.baseUrl).toBe('https://staging.example.com');
    });

    it('asks for port when HTTP is selected for remote host', async () => {
      interactiveService.promptText.mockImplementation((message: string) => {
        if (message.includes('host'))
          return Promise.resolve('staging.example.com');
        if (message.includes('port')) return Promise.resolve('8080');
        if (message.includes('organization')) return Promise.resolve('org');
        if (message.includes('project')) return Promise.resolve('proj');
        if (message.includes('branch')) return Promise.resolve('main');
        if (message.includes('username')) return Promise.resolve('admin');
        return Promise.resolve('');
      });
      interactiveService.promptPassword.mockResolvedValue('pass');
      interactiveService.promptConfirm.mockResolvedValue(false);
      interactiveService.promptSelect.mockResolvedValue('password');

      const result = await service.parseAndComplete(undefined, 'source');

      expect(result.baseUrl).toBe('http://staging.example.com:8080');
    });

    it('accepts URL with http:// protocol directly', async () => {
      interactiveService.promptText.mockImplementation((message: string) => {
        if (message.includes('host'))
          return Promise.resolve('http://localhost:5173/');
        if (message.includes('organization')) return Promise.resolve('org');
        if (message.includes('project')) return Promise.resolve('proj');
        if (message.includes('branch')) return Promise.resolve('master');
        if (message.includes('username')) return Promise.resolve('admin');
        return Promise.resolve('');
      });
      interactiveService.promptPassword.mockResolvedValue('pass');
      interactiveService.promptSelect.mockResolvedValue('password');

      const result = await service.parseAndComplete(undefined, 'source');

      expect(result.baseUrl).toBe('http://localhost:5173');
    });

    it('accepts URL with https:// protocol directly', async () => {
      interactiveService.promptText.mockImplementation((message: string) => {
        if (message.includes('host'))
          return Promise.resolve('https://cloud.revisium.io/');
        if (message.includes('organization')) return Promise.resolve('org');
        if (message.includes('project')) return Promise.resolve('proj');
        if (message.includes('branch')) return Promise.resolve('master');
        if (message.includes('username')) return Promise.resolve('admin');
        return Promise.resolve('');
      });
      interactiveService.promptPassword.mockResolvedValue('pass');
      interactiveService.promptSelect.mockResolvedValue('password');

      const result = await service.parseAndComplete(undefined, 'source');

      expect(result.baseUrl).toBe('https://cloud.revisium.io');
    });
  });

  describe('buildBaseUrl', () => {
    it('builds URL with port', () => {
      expect(service.buildBaseUrl('http', 'localhost', 8080)).toBe(
        'http://localhost:8080',
      );
    });

    it('builds URL without port', () => {
      expect(service.buildBaseUrl('https', 'cloud.revisium.io')).toBe(
        'https://cloud.revisium.io',
      );
    });
  });

  describe('formatAsRevisiumUrl', () => {
    it('formats complete URL with masked password', () => {
      const url = {
        baseUrl: 'https://cloud.revisium.io',
        auth: {
          method: 'password' as const,
          username: 'admin',
          password: 'secret',
        },
        organization: 'myorg',
        project: 'myproject',
        branch: 'master',
        revision: 'draft',
      };

      expect(service.formatAsRevisiumUrl(url)).toBe(
        'revisium://admin:****@cloud.revisium.io/myorg/myproject/master',
      );
    });

    it('formats URL with unmasked password when specified', () => {
      const url = {
        baseUrl: 'https://cloud.revisium.io',
        auth: {
          method: 'password' as const,
          username: 'admin',
          password: 'secret',
        },
        organization: 'myorg',
        project: 'myproject',
        branch: 'master',
        revision: 'draft',
      };

      expect(service.formatAsRevisiumUrl(url, false)).toBe(
        'revisium://admin:secret@cloud.revisium.io/myorg/myproject/master',
      );
    });

    it('formats localhost URL with port', () => {
      const url = {
        baseUrl: 'http://localhost:8080',
        auth: {
          method: 'password' as const,
          username: 'admin',
          password: 'pass',
        },
        organization: 'org',
        project: 'proj',
        branch: 'develop',
        revision: 'draft',
      };

      expect(service.formatAsRevisiumUrl(url)).toBe(
        'revisium://admin:****@localhost:8080/org/proj/develop',
      );
    });

    it('formats URL without branch', () => {
      const url = {
        baseUrl: 'https://cloud.revisium.io',
        auth: {
          method: 'password' as const,
          username: 'admin',
          password: 'secret',
        },
        organization: 'myorg',
        project: 'myproject',
        branch: '',
        revision: 'draft',
      };

      expect(service.formatAsRevisiumUrl(url)).toBe(
        'revisium://admin:****@cloud.revisium.io/myorg/myproject',
      );
    });

    it('formats URL with token auth', () => {
      const url = {
        baseUrl: 'https://cloud.revisium.io',
        auth: {
          method: 'token' as const,
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        organization: 'myorg',
        project: 'myproject',
        branch: 'master',
        revision: 'head',
      };

      expect(service.formatAsRevisiumUrl(url)).toBe(
        'revisium://cloud.revisium.io/myorg/myproject/master:head?token=****',
      );
    });

    it('formats URL with revision', () => {
      const url = {
        baseUrl: 'https://cloud.revisium.io',
        auth: {
          method: 'password' as const,
          username: 'admin',
          password: 'secret',
        },
        organization: 'myorg',
        project: 'myproject',
        branch: 'master',
        revision: 'head',
      };

      expect(service.formatAsRevisiumUrl(url)).toBe(
        'revisium://admin:****@cloud.revisium.io/myorg/myproject/master:head',
      );
    });
  });
});
