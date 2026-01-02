import { Test, TestingModule } from '@nestjs/testing';
import { InteractiveService } from '../interactive.service';
import * as prompts from '@inquirer/prompts';

jest.mock('@inquirer/prompts', () => ({
  input: jest.fn(),
  password: jest.fn(),
  confirm: jest.fn(),
  select: jest.fn(),
}));

describe('InteractiveService', () => {
  let service: InteractiveService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InteractiveService],
    }).compile();

    service = module.get<InteractiveService>(InteractiveService);
    jest.clearAllMocks();
  });

  describe('promptText', () => {
    it('calls input with message and default value', async () => {
      (prompts.input as jest.Mock).mockResolvedValue('user-input');

      const result = await service.promptText('Enter name:', 'default-name');

      expect(prompts.input).toHaveBeenCalledWith({
        message: 'Enter name:',
        default: 'default-name',
      });
      expect(result).toBe('user-input');
    });

    it('calls input without default value', async () => {
      (prompts.input as jest.Mock).mockResolvedValue('user-input');

      const result = await service.promptText('Enter name:');

      expect(prompts.input).toHaveBeenCalledWith({
        message: 'Enter name:',
        default: undefined,
      });
      expect(result).toBe('user-input');
    });
  });

  describe('promptPassword', () => {
    it('calls password with message and mask', async () => {
      (prompts.password as jest.Mock).mockResolvedValue('secret123');

      const result = await service.promptPassword('Enter password:');

      expect(prompts.password).toHaveBeenCalledWith({
        message: 'Enter password:',
        mask: '*',
      });
      expect(result).toBe('secret123');
    });
  });

  describe('promptConfirm', () => {
    it('calls confirm with message and default true', async () => {
      (prompts.confirm as jest.Mock).mockResolvedValue(true);

      const result = await service.promptConfirm('Continue?');

      expect(prompts.confirm).toHaveBeenCalledWith({
        message: 'Continue?',
        default: true,
      });
      expect(result).toBe(true);
    });

    it('calls confirm with custom default value', async () => {
      (prompts.confirm as jest.Mock).mockResolvedValue(false);

      const result = await service.promptConfirm('Continue?', false);

      expect(prompts.confirm).toHaveBeenCalledWith({
        message: 'Continue?',
        default: false,
      });
      expect(result).toBe(false);
    });
  });

  describe('promptSelect', () => {
    it('calls select with message and choices', async () => {
      const choices = [
        { name: 'Option A', value: 'a' },
        { name: 'Option B', value: 'b' },
      ];
      (prompts.select as jest.Mock).mockResolvedValue('a');

      const result = await service.promptSelect('Choose option:', choices);

      expect(prompts.select).toHaveBeenCalledWith({
        message: 'Choose option:',
        choices,
      });
      expect(result).toBe('a');
    });
  });
});
