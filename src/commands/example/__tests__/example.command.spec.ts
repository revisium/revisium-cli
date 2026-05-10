import { ExampleCommand } from '../example.command';

describe('ExampleCommand', () => {
  it('shows help when no example subcommand is provided', async () => {
    const command = new ExampleCommand();
    const help = jest.fn();

    Object.assign(command, { command: { help } });

    await command.run();

    expect(help).toHaveBeenCalled();
  });
});
