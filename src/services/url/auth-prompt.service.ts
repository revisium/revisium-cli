import { Injectable } from '@nestjs/common';
import { InteractiveService } from '../common';

export type AuthMethod = 'none' | 'token' | 'apikey' | 'password';

export type AuthCredentials =
  | { method: 'none' }
  | { method: 'token'; token: string }
  | { method: 'apikey'; apikey: string }
  | { method: 'password'; username: string; password: string };

@Injectable()
export class AuthPromptService {
  constructor(private readonly interactive: InteractiveService) {}

  async promptForAuth(
    label: string,
    baseUrl: string,
  ): Promise<AuthCredentials> {
    if (!process.stdin.isTTY) {
      throw new Error(
        `No credentials found and stdin is not a TTY. Set REVISIUM_API_KEY or REVISIUM_TOKEN, or run revisium auth login --url ${baseUrl}.`,
      );
    }

    const tokenPageUrl = this.getTokenPageUrl(baseUrl);

    const authMethod = await this.interactive.promptSelect<AuthMethod>(
      `[${label}] Choose authentication method:`,
      [
        { name: `Token (copy from ${tokenPageUrl})`, value: 'token' },
        { name: 'API Key (for automated access)', value: 'apikey' },
        { name: 'Username & Password', value: 'password' },
        {
          name: 'No Auth (target does not require credentials)',
          value: 'none',
        },
      ],
    );

    if (authMethod === 'none') {
      return { method: 'none' };
    }

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
    if (!password?.trim()) {
      throw new Error('Password cannot be empty');
    }

    return { method: 'password', username: username.trim(), password };
  }

  private getTokenPageUrl(baseUrl: string): string {
    const normalizedUrl = baseUrl.endsWith('/')
      ? baseUrl.slice(0, -1)
      : baseUrl;
    return `${normalizedUrl}/get-token`;
  }
}
