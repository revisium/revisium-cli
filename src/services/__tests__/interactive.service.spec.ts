import { InteractiveService } from '../interactive.service';
import { input, password, confirm, select } from '@inquirer/prompts';

jest.mock('@inquirer/prompts');

const mockedInput = input as jest.MockedFunction<typeof input>;
const mockedPassword = password as jest.MockedFunction<typeof password>;
const mockedConfirm = confirm as jest.MockedFunction<typeof confirm>;
const mockedSelect = select as jest.MockedFunction<typeof select>;

describe('InteractiveService', () => {
  let service: InteractiveService;

  beforeEach(() => {
    service = new InteractiveService();
    jest.clearAllMocks();
  });

  describe('promptText', () => {
    it('calls input with message', async () => {
      mockedInput.mockResolvedValue('user input');

      const result = await service.promptText('Enter value:');

      expect(result).toBe('user input');
      expect(mockedInput).toHaveBeenCalledWith({
        message: 'Enter value:',
        default: undefined,
      });
    });

    it('calls input with message and default value', async () => {
      mockedInput.mockResolvedValue('default');

      const result = await service.promptText('Enter value:', 'default');

      expect(result).toBe('default');
      expect(mockedInput).toHaveBeenCalledWith({
        message: 'Enter value:',
        default: 'default',
      });
    });
  });

  describe('promptPassword', () => {
    it('calls password with message and mask', async () => {
      mockedPassword.mockResolvedValue('secret123');

      const result = await service.promptPassword('Enter password:');

      expect(result).toBe('secret123');
      expect(mockedPassword).toHaveBeenCalledWith({
        message: 'Enter password:',
        mask: '*',
      });
    });
  });

  describe('promptConfirm', () => {
    it('calls confirm with message and default true', async () => {
      mockedConfirm.mockResolvedValue(true);

      const result = await service.promptConfirm('Are you sure?');

      expect(result).toBe(true);
      expect(mockedConfirm).toHaveBeenCalledWith({
        message: 'Are you sure?',
        default: true,
      });
    });

    it('calls confirm with message and custom default', async () => {
      mockedConfirm.mockResolvedValue(false);

      const result = await service.promptConfirm('Continue?', false);

      expect(result).toBe(false);
      expect(mockedConfirm).toHaveBeenCalledWith({
        message: 'Continue?',
        default: false,
      });
    });
  });

  describe('promptSelect', () => {
    it('calls select with message and choices', async () => {
      const choices = [
        { name: 'Option A', value: 'a' },
        { name: 'Option B', value: 'b' },
      ];
      mockedSelect.mockResolvedValue('b');

      const result = await service.promptSelect('Choose option:', choices);

      expect(result).toBe('b');
      expect(mockedSelect).toHaveBeenCalledWith({
        message: 'Choose option:',
        choices,
      });
    });

    it('works with typed values', async () => {
      const choices = [
        { name: 'First', value: 1 },
        { name: 'Second', value: 2 },
      ];
      mockedSelect.mockResolvedValue(2);

      const result = await service.promptSelect<number>(
        'Pick number:',
        choices,
      );

      expect(result).toBe(2);
    });
  });
});
