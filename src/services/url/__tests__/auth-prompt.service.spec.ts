import { AuthPromptService } from '../auth-prompt.service';
import { InteractiveService } from '../../common';

describe('AuthPromptService', () => {
  let originalIsTty: boolean | undefined;
  let interactive: {
    promptSelect: jest.Mock;
    promptPassword: jest.Mock;
    promptText: jest.Mock;
  };
  let service: AuthPromptService;

  beforeEach(() => {
    originalIsTty = process.stdin.isTTY;
    interactive = {
      promptSelect: jest.fn(),
      promptPassword: jest.fn(),
      promptText: jest.fn(),
    };
    service = new AuthPromptService(
      interactive as unknown as InteractiveService,
    );
  });

  afterEach(() => {
    Object.assign(process.stdin, { isTTY: originalIsTty });
  });

  it('fails deterministically instead of prompting when stdin is not a TTY', async () => {
    Object.assign(process.stdin, { isTTY: false });

    await expect(
      service.promptForAuth('api', 'http://localhost:9222'),
    ).rejects.toThrow(
      'No credentials found and stdin is not a TTY. Set REVISIUM_API_KEY or REVISIUM_TOKEN',
    );

    expect(interactive.promptSelect).not.toHaveBeenCalled();
    expect(interactive.promptPassword).not.toHaveBeenCalled();
    expect(interactive.promptText).not.toHaveBeenCalled();
  });
});
