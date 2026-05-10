import { ProjectEnsureCommand } from '../project-ensure.command';
import { BootstrapService } from 'src/services/bootstrap';
import { LoggerService } from 'src/services/common';

describe('ProjectEnsureCommand', () => {
  let bootstrapService: { ensureProject: jest.Mock };
  let logger: { info: jest.Mock; success: jest.Mock };
  let command: ProjectEnsureCommand;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    bootstrapService = {
      ensureProject: jest.fn().mockResolvedValue({
        organization: 'admin',
        project: 'dictionary',
        branch: 'master',
        projectStatus: 'created',
        branchStatus: 'created',
        dryRun: false,
      }),
    };
    logger = { info: jest.fn(), success: jest.fn() };
    command = new ProjectEnsureCommand(
      bootstrapService as unknown as BootstrapService,
      logger as unknown as LoggerService,
    );
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs success when a new project is created', async () => {
    await command.run([], { url: 'revisium://local' });

    expect(bootstrapService.ensureProject).toHaveBeenCalledWith(
      { url: 'revisium://local' },
      undefined,
    );
    expect(logger.success).toHaveBeenCalledWith(
      'Created project "admin/dictionary" (created branch: master)',
    );
  });

  it('logs an "exists" message when the project is skipped', async () => {
    bootstrapService.ensureProject.mockResolvedValue({
      organization: 'admin',
      project: 'dictionary',
      branch: 'master',
      projectStatus: 'skipped',
      branchStatus: 'skipped',
      dryRun: false,
    });

    await command.run([], { context: 'cloud' });

    expect(logger.success).toHaveBeenCalledWith(
      'Project exists "admin/dictionary" (branch exists: master)',
    );
  });

  it('prefixes the message with "Dry run: " when dry-run is set', async () => {
    bootstrapService.ensureProject.mockResolvedValue({
      organization: 'admin',
      project: 'dictionary',
      branch: 'master',
      projectStatus: 'created',
      branchStatus: 'skipped',
      dryRun: true,
    });

    await command.run([], { dryRun: true });

    expect(bootstrapService.ensureProject).toHaveBeenCalledWith(
      { dryRun: true },
      true,
    );
    expect(logger.success).toHaveBeenCalledWith(
      'Dry run: Created project "admin/dictionary" (branch exists: master)',
    );
  });

  it('emits JSON when --json is set', async () => {
    bootstrapService.ensureProject.mockResolvedValue({
      organization: 'admin',
      project: 'dictionary',
      branch: 'master',
      projectStatus: 'skipped',
      branchStatus: 'skipped',
      dryRun: false,
    });

    await command.run([], { json: true });

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          organization: 'admin',
          project: 'dictionary',
          branch: 'master',
          projectStatus: 'skipped',
          branchStatus: 'skipped',
          dryRun: false,
        },
        null,
        2,
      ),
    );
    expect(logger.success).not.toHaveBeenCalled();
  });

  it('parses boolean options', () => {
    expect(command.parseDryRun('true')).toBe(true);
    expect(command.parseDryRun()).toBe(true);
    expect(command.parseJson('false')).toBe(false);
    expect(command.parseJson()).toBe(true);
  });
});
