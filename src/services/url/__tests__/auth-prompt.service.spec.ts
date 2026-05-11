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

  it('offers a No Auth choice that returns method "none" without prompting for secrets', async () => {
    Object.assign(process.stdin, { isTTY: true });
    interactive.promptSelect.mockResolvedValue('none');

    const result = await service.promptForAuth('api', 'http://localhost:9222');

    expect(result).toEqual({ method: 'none' });
    expect(interactive.promptSelect).toHaveBeenCalledTimes(1);
    const firstCall = interactive.promptSelect.mock.calls[0] as [
      string,
      Array<{ name: string; value: string }>,
    ];
    const options = firstCall[1];
    const noAuth = options.find((o) => o.value === 'none');
    expect(noAuth).toBeDefined();
    expect(noAuth?.name).toMatch(/No Auth/i);
    expect(interactive.promptPassword).not.toHaveBeenCalled();
    expect(interactive.promptText).not.toHaveBeenCalled();
  });
});
