import { EndpointEnsureCommand } from '../endpoint-ensure.command';
import { BootstrapService } from 'src/services/bootstrap';
import { LoggerService } from 'src/services/common';

describe('EndpointEnsureCommand', () => {
  let bootstrapService: {
    ensureEndpoint: jest.Mock;
    resolveTarget: jest.Mock;
    formatEndpointHint: jest.Mock;
    parseEndpointType: jest.Mock;
  };
  let logger: { info: jest.Mock; success: jest.Mock };
  let command: EndpointEnsureCommand;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    bootstrapService = {
      ensureEndpoint: jest.fn().mockResolvedValue({
        endpoint: { id: 'rest-id', type: 'REST_API' },
        status: 'created',
        revision: 'draft',
        dryRun: false,
      }),
      resolveTarget: jest.fn().mockResolvedValue({
        baseUrl: 'http://localhost:9222',
        organization: 'admin',
        project: 'dictionary',
        branch: 'master',
        revision: 'draft',
      }),
      formatEndpointHint: jest
        .fn()
        .mockReturnValue('http://localhost:9222/endpoint/rest/admin/x/y/draft'),
      parseEndpointType: jest.fn().mockReturnValue('REST_API'),
    };
    logger = { info: jest.fn(), success: jest.fn() };
    command = new EndpointEnsureCommand(
      bootstrapService as unknown as BootstrapService,
      logger as unknown as LoggerService,
    );
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('rejects when --type is missing', async () => {
    await expect(command.run([], { type: undefined as never })).rejects.toThrow(
      '--type option is required',
    );
  });

  it('logs created endpoint info with hint', async () => {
    await command.run([], { type: 'REST_API' });

    expect(bootstrapService.ensureEndpoint).toHaveBeenCalledWith(
      { type: 'REST_API' },
      'REST_API',
      undefined,
    );
    expect(logger.success).toHaveBeenCalledWith(
      'Created endpoint rest-id (REST_API)',
    );
    expect(logger.info).toHaveBeenCalledWith('Revision: draft');
    expect(logger.info).toHaveBeenCalledWith(
      'Hint: http://localhost:9222/endpoint/rest/admin/x/y/draft',
    );
  });

  it('shows "Found" when endpoint already exists', async () => {
    bootstrapService.ensureEndpoint.mockResolvedValue({
      endpoint: { id: 'rest-id', type: 'REST_API' },
      status: 'skipped',
      revision: 'draft',
      dryRun: false,
    });

    await command.run([], { type: 'REST_API' });

    expect(logger.success).toHaveBeenCalledWith(
      'Found endpoint rest-id (REST_API)',
    );
  });

  it('uses <dry-run> placeholder when no endpoint id is returned', async () => {
    bootstrapService.ensureEndpoint.mockResolvedValue({
      endpoint: { type: 'GRAPHQL' },
      status: 'created',
      revision: 'draft',
      dryRun: true,
    });

    await command.run([], { type: 'GRAPHQL', dryRun: true });

    expect(logger.success).toHaveBeenCalledWith(
      'Created endpoint <dry-run> (GRAPHQL)',
    );
  });

  it('emits JSON when --json is set', async () => {
    await command.run([], { type: 'REST_API', json: true });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const firstCall = logSpy.mock.calls[0] as unknown[];
    const payload = JSON.parse(firstCall[0] as string) as Record<
      string,
      unknown
    >;
    expect(payload).toEqual({
      endpoint: { id: 'rest-id', type: 'REST_API' },
      status: 'created',
      revision: 'draft',
      dryRun: false,
      hint: 'http://localhost:9222/endpoint/rest/admin/x/y/draft',
    });
    expect(logger.success).not.toHaveBeenCalled();
  });

  it('delegates option parsing to BootstrapService.parseEndpointType', () => {
    expect(command.parseType('REST_API')).toBe('REST_API');
    expect(bootstrapService.parseEndpointType).toHaveBeenCalledWith('REST_API');
  });

  it('parses boolean flags', () => {
    expect(command.parseDryRun('true')).toBe(true);
    expect(command.parseJson()).toBe(true);
  });
});
