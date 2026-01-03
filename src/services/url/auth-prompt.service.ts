import { Injectable } from '@nestjs/common';
import { InteractiveService } from '../common';

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
      if (!token?.trim()) {
        throw new Error('Token cannot be empty');
      }
      return { method: 'token', token: token.trim() };
    }

    if (authMethod === 'apikey') {
      const apikey = await this.interactive.promptPassword(
        `[${label}] Enter API key:`,
      );
      if (!apikey?.trim()) {
        throw new Error('API key cannot be empty');
      }
      return { method: 'apikey', apikey: apikey.trim() };
    }

    const username = await this.interactive.promptText(
      `[${label}] Enter username:`,
    );
    if (!username?.trim()) {
      throw new Error('Username cannot be empty');
    }

    const password = await this.interactive.promptPassword(
      `[${label}] Enter password:`,
    );
    if (!password) {
      throw new Error('Password cannot be empty');
    }

    return { method: 'password', username: username.trim(), password };
  }

  private getTokenPageUrl(baseUrl: string): string {
    return `${baseUrl}/get-mcp-token`;
  }
}
