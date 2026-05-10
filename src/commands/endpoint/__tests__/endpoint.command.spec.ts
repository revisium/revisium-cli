import { EndpointCommand } from '../endpoint.command';

describe('EndpointCommand', () => {
  it('shows help when no endpoint subcommand is provided', async () => {
    const command = new EndpointCommand();
    const help = jest.fn();

    Object.assign(command, { command: { help } });

    await command.run();

    expect(help).toHaveBeenCalled();
  });
});
