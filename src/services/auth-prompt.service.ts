import { Injectable } from '@nestjs/common';
import { InteractiveService } from './interactive.service';

export type AuthMethod = 'token' | 'apikey' | 'password';

export interface AuthCredentials {
  method: AuthMethod;
  token?: string;
  apikey?: string;
  username?: string;
  password?: string;
}

@Injectable()
export class AuthPromptService {
  constructor(private readonly interactive: InteractiveService) {}

  async promptForAuth(
    label: string,
    baseUrl: string,
  ): Promise<AuthCredentials> {
    const tokenPageUrl = this.getTokenPageUrl(baseUrl);

    const authMethod = await this.interactive.promptSelect<AuthMethod>(
      `[${label}] Choose authentication method:`,
      [
        {
          name: `Token (copy from ${tokenPageUrl})`,
          value: 'token' as AuthMethod,
        },
        {
          name: 'API Key (for automated access)',
          value: 'apikey' as AuthMethod,
        },
        { name: 'Username & Password', value: 'password' as AuthMethod },
      ],
    );

    if (authMethod === 'token') {
      const token = await this.interactive.promptPassword(
        `[${label}] Paste token:`,
      );
      return { method: 'token', token };
    }

    if (authMethod === 'apikey') {
      const apikey = await this.interactive.promptPassword(
        `[${label}] Enter API key:`,
      );
      return { method: 'apikey', apikey };
    }

    const username = await this.interactive.promptText(
      `[${label}] Enter username:`,
    );
    const password = await this.interactive.promptPassword(
      `[${label}] Enter password:`,
    );

    return { method: 'password', username, password };
  }

  private getTokenPageUrl(baseUrl: string): string {
    return `${baseUrl}/get-mcp-token`;
  }
}
