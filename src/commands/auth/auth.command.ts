import { Command, CommandRunner } from 'nest-commander';
import { AuthLoginCommand } from './auth-login.command';
import { AuthLogoutCommand } from './auth-logout.command';
import { AuthStatusCommand } from './auth-status.command';

@Command({
  name: 'auth',
  description: 'Manage saved Revisium credentials',
  subCommands: [AuthLoginCommand, AuthStatusCommand, AuthLogoutCommand],
})
export class AuthCommand extends CommandRunner {
  constructor() {
    super();
  }

  run(): Promise<void> {
    this.command.help();
    return Promise.resolve();
  }
}
