import { ExampleBootstrapCommand } from '../example-bootstrap.command';
import {
  BootstrapService,
  ExampleBootstrapSummary,
} from 'src/services/bootstrap';
import { LoggerService } from 'src/services/common';

describe('ExampleBootstrapCommand', () => {
  let bootstrapService: {
    bootstrapExample: jest.Mock;
    parseEndpointType: jest.Mock;
  };
  let logger: { info: jest.Mock; success: jest.Mock; summary: jest.Mock };
  let command: ExampleBootstrapCommand;
  let logSpy: jest.SpyInstance;
  let summary: ExampleBootstrapSummary;

  beforeEach(() => {
    summary = {
      dryRun: false,
      target: {
        organization: 'admin',
        project: 'dictionary',
        branch: 'master',
        revision: 'draft',
      },
      project: {
        organization: 'admin',
        project: 'dictionary',
        branch: 'master',
        projectStatus: 'created',
        branchStatus: 'created',
        dryRun: false,
      },
      tables: { created: ['Faq'], skipped: [], conflicts: [] },
      rows: { created: [], skipped: ['x/y'], conflicts: [] },
      endpoints: { created: ['REST_API'], skipped: [], conflicts: [] },
      commit: { status: 'created', revisionId: 'rev-1' },
    };
    bootstrapService = {
      bootstrapExample: jest.fn().mockResolvedValue(summary),
      parseEndpointType: jest.fn((value: string) => value),
    };
    logger = {
      info: jest.fn(),
      success: jest.fn(),
      summary: jest.fn(),
    };
    command = new ExampleBootstrapCommand(
      bootstrapService as unknown as BootstrapService,
      logger as unknown as LoggerService,
    );
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('rejects when --config is missing', async () => {
    await expect(
      command.run([], { config: undefined as never }),
    ).rejects.toThrow('--config option is required');
  });

  it('forwards options to BootstrapService.bootstrapExample', async () => {
    await command.run([], {
      config: './bootstrap.json',
      url: 'revisium://local',
      context: 'ctx',
      commit: true,
      dryRun: false,
      endpoint: ['REST_API'],
    });

    expect(bootstrapService.bootstrapExample).toHaveBeenCalledWith({
      url: 'revisium://local',
      context: 'ctx',
      configPath: './bootstrap.json',
      commit: true,
      dryRun: false,
      endpointOverrides: ['REST_API'],
    });
  });

  it('prints a human-readable summary by default', async () => {
    await command.run([], { config: './bootstrap.json' });

    expect(logger.summary).toHaveBeenCalledWith(
      'Bootstrap admin/dictionary/master:draft',
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Project: created, branch: created',
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Tables: created 1, skipped 0, conflicts 0',
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Rows: created 0, skipped 1, conflicts 0',
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Endpoints: created 1, skipped 0, conflicts 0',
    );
    expect(logger.info).toHaveBeenCalledWith('Commit: created');
    expect(logger.info).toHaveBeenCalledWith('Revision: rev-1');
  });

  it('prefixes the summary with "Dry run: " when dry-run', async () => {
    summary.dryRun = true;
    summary.commit = { status: 'dry-run', message: 'm' };
    delete (summary.commit as { revisionId?: string }).revisionId;

    await command.run([], { config: './bootstrap.json' });

    expect(logger.summary).toHaveBeenCalledWith(
      'Dry run: Bootstrap admin/dictionary/master:draft',
    );
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Revision:'),
    );
  });

  it('emits JSON when --json is set', async () => {
    await command.run([], { config: './bootstrap.json', json: true });

    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(summary, null, 2));
    expect(logger.summary).not.toHaveBeenCalled();
  });

  it('parses --endpoint repeatedly via BootstrapService.parseEndpointType', () => {
    const first = command.parseEndpoint('REST_API');
    expect(first).toEqual(['REST_API']);
    const second = command.parseEndpoint('GRAPHQL', first);
    expect(second).toEqual(['REST_API', 'GRAPHQL']);
    expect(bootstrapService.parseEndpointType).toHaveBeenCalledTimes(2);
  });

  it('parses boolean and string flags', () => {
    expect(command.parseConfig('./bootstrap.json')).toBe('./bootstrap.json');
    expect(command.parseCommit('true')).toBe(true);
    expect(command.parseCommit()).toBe(true);
    expect(command.parseDryRun()).toBe(true);
    expect(command.parseJson()).toBe(true);
    expect(command.parseNoInput()).toBe(true);
  });
});
