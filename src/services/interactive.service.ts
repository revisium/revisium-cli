import { Injectable } from '@nestjs/common';
import { input, password, confirm, select } from '@inquirer/prompts';

export interface SelectChoice<T> {
  name: string;
  value: T;
}

@Injectable()
export class InteractiveService {
  async promptText(message: string, defaultValue?: string): Promise<string> {
    return input({
      message,
      default: defaultValue,
    });
  }

  async promptPassword(message: string): Promise<string> {
    return password({
      message,
      mask: '*',
    });
  }

  async promptConfirm(
    message: string,
    defaultValue: boolean = true,
  ): Promise<boolean> {
    return confirm({
      message,
      default: defaultValue,
    });
  }

  async promptSelect<T>(
    message: string,
    choices: SelectChoice<T>[],
  ): Promise<T> {
    return select({
      message,
      choices,
    });
  }
}
