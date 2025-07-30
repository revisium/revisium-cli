import { spawn } from 'child_process';
import { Command, CommandRunner, Option } from 'nest-commander';
import { userInfo } from 'os';

@Command({
  name: 'my-exec',
  arguments: '<task>',
  options: { isDefault: true },
})
export class TaskRunner extends CommandRunner {
  async run(inputs: string[], options: Record<string, string>): Promise<void> {
    await Promise.resolve(1);
    console.log({ inputs, options });
    const echo = spawn(inputs[0], {
      shell: options.shell ?? userInfo().shell,
    });
    echo.stdout.on('data', (data: Buffer) => {
      console.log(data.toString());
    });
  }

  @Option({
    flags: '-s, --shell <shell>',
    description: 'A different shell to spawn than the default',
  })
  parseShell(val: string) {
    return val;
  }
}
