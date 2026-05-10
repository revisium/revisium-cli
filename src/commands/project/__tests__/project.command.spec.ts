import { ProjectCommand } from '../project.command';

describe('ProjectCommand', () => {
  it('shows help when no project subcommand is provided', async () => {
    const command = new ProjectCommand();
    const help = jest.fn();

    Object.assign(command, { command: { help } });

    await command.run();

    expect(help).toHaveBeenCalled();
  });
});
