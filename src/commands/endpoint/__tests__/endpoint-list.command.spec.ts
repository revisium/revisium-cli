import { EndpointListCommand } from '../endpoint-list.command';
import { BootstrapService } from 'src/services/bootstrap';
import { LoggerService } from 'src/services/common';

describe('EndpointListCommand', () => {
  let bootstrapService: { listEndpoints: jest.Mock };
  let logger: { info: jest.Mock };
  let command: EndpointListCommand;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    bootstrapService = { listEndpoints: jest.fn() };
    logger = { info: jest.fn() };
    command = new EndpointListCommand(
      bootstrapService as unknown as BootstrapService,
      logger as unknown as LoggerService,
    );
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs each endpoint id and type', async () => {
    bootstrapService.listEndpoints.mockResolvedValue([
      { id: 'rest', type: 'REST_API' },
      { id: 'graphql', type: 'GRAPHQL' },
    ]);

    await command.run([], {});

    expect(logger.info).toHaveBeenCalledWith('rest\tREST_API');
    expect(logger.info).toHaveBeenCalledWith('graphql\tGRAPHQL');
  });

  it('reports when no endpoints exist', async () => {
    bootstrapService.listEndpoints.mockResolvedValue([]);

    await command.run([], {});

    expect(logger.info).toHaveBeenCalledWith('No generated endpoints found');
  });

  it('emits JSON when --json is set', async () => {
    const endpoints = [{ id: 'rest', type: 'REST_API' }];
    bootstrapService.listEndpoints.mockResolvedValue(endpoints);

    await command.run([], { json: true });

    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ endpoints }, null, 2));
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('parses --json flag', () => {
    expect(command.parseJson('true')).toBe(true);
    expect(command.parseJson()).toBe(true);
  });
});
