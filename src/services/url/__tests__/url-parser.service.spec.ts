import { UrlParserService } from '../url-parser.service';

describe('UrlParserService', () => {
  let service: UrlParserService;

  beforeEach(() => {
    service = new UrlParserService();
  });

  describe('parse - revisium+http://', () => {
    it('forces HTTP for non-localhost host', () => {
      const result = service.parse(
        'revisium+http://admin:pass@my-service:80/org/proj/branch',
      );

      expect(result).toEqual({
        baseUrl: 'http://my-service:80',
        username: 'admin',
        password: 'pass',
        token: undefined,
        apikey: undefined,
        organization: 'org',
        project: 'proj',
        branch: 'branch',
        revision: undefined,
      });
    });

    it('forces HTTP for non-localhost host with draft revision', () => {
      const result = service.parse(
        'revisium+http://admin:pass@my-service:80/org/proj/branch:draft',
      );

      expect(result).toEqual({
        baseUrl: 'http://my-service:80',
        username: 'admin',
        password: 'pass',
        token: undefined,
        apikey: undefined,
        organization: 'org',
        project: 'proj',
        branch: 'branch',
        revision: 'draft',
      });
    });

    it('forces HTTP without port', () => {
      const result = service.parse(
        'revisium+http://admin:pass@my-service/org/proj/branch',
      );

      expect(result).toEqual({
        baseUrl: 'http://my-service',
        username: 'admin',
        password: 'pass',
        token: undefined,
        apikey: undefined,
        organization: 'org',
        project: 'proj',
        branch: 'branch',
        revision: undefined,
      });
    });

    it('forces HTTP with token auth', () => {
      const result = service.parse(
        'revisium+http://payment-svc:80/org/proj/master?token=abc123',
      );

      expect(result).toEqual({
        baseUrl: 'http://payment-svc:80',
        username: undefined,
        password: undefined,
        token: 'abc123',
        apikey: undefined,
        organization: 'org',
        project: 'proj',
        branch: 'master',
        revision: undefined,
      });
    });
  });

  describe('parse - revisium+https://', () => {
    it('forces HTTPS for any host', () => {
      const result = service.parse(
        'revisium+https://admin:pass@my-service/org/proj/branch',
      );

      expect(result).toEqual({
        baseUrl: 'https://my-service',
        username: 'admin',
        password: 'pass',
        token: undefined,
        apikey: undefined,
        organization: 'org',
        project: 'proj',
        branch: 'branch',
        revision: undefined,
      });
    });

    it('forces HTTPS even for localhost', () => {
      const result = service.parse(
        'revisium+https://admin:pass@localhost:8443/org/proj/main',
      );

      expect(result).toEqual({
        baseUrl: 'https://localhost:8443',
        username: 'admin',
        password: 'pass',
        token: undefined,
        apikey: undefined,
        organization: 'org',
        project: 'proj',
        branch: 'main',
        revision: undefined,
      });
    });
  });

  describe('parse - revisium:// (unchanged behavior)', () => {
    it('auto-detects http for localhost', () => {
      const result = service.parse(
        'revisium://admin:pass@localhost:8888/org/proj/branch',
      );

      expect(result.baseUrl).toBe('http://localhost:8888');
    });

    it('auto-detects https for remote host', () => {
      const result = service.parse(
        'revisium://admin:pass@cloud.revisium.io/org/proj/branch',
      );

      expect(result.baseUrl).toBe('https://cloud.revisium.io');
    });
  });

  describe('buildBaseUrlFromHost - protocolOverride', () => {
    it('uses override when provided', () => {
      expect(service.buildBaseUrlFromHost('my-service:80', 'http')).toBe(
        'http://my-service:80',
      );
    });

    it('override takes precedence over localhost auto-detect', () => {
      expect(service.buildBaseUrlFromHost('localhost:8080', 'https')).toBe(
        'https://localhost:8080',
      );
    });

    it('falls back to auto-detect when no override', () => {
      expect(service.buildBaseUrlFromHost('localhost:8080')).toBe(
        'http://localhost:8080',
      );
      expect(service.buildBaseUrlFromHost('cloud.revisium.io')).toBe(
        'https://cloud.revisium.io',
      );
    });
  });
});
