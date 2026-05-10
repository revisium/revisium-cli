import { AuthCommand } from '../auth.command';

describe('AuthCommand', () => {
  it('shows help when no auth subcommand is provided', async () => {
    const command = new AuthCommand();
    const help = jest.fn();

    Object.assign(command, {
      command: {
        help,
      },
    });

    await command.run();

    expect(help).toHaveBeenCalled();
  });
});
