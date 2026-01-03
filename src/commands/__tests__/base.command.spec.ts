import { Test, TestingModule } from '@nestjs/testing';
import { CommandRunner } from 'nest-commander';
import { BaseCommand } from '../base.command';

describe('BaseCommand', () => {
  let command: BaseCommand;

  class TestCommand extends BaseCommand {
    async run(): Promise<void> {}
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TestCommand],
    }).compile();

    command = module.get<TestCommand>(TestCommand);
  });

  describe('parseUrl', () => {
    it('parses URL option correctly', () => {
      const testValue =
        'revisium://example.com/test-org/test-project/main?token=abc123';

      const result = command.parseUrl(testValue);

      expect(result).toBe(testValue);
    });

    it('handles URL with revision', () => {
      const testValue =
        'revisium://example.com/test-org/test-project/main:abc123';

      const result = command.parseUrl(testValue);

      expect(result).toBe(testValue);
    });

    it('handles empty string values', () => {
      expect(command.parseUrl('')).toBe('');
    });

    it('handles special characters in URL', () => {
      const specialUrl =
        'revisium://example.com/org-123/proj_test/main?token=abc@123!';

      expect(command.parseUrl(specialUrl)).toBe(specialUrl);
    });

    it('handles whitespace values correctly', () => {
      const whitespaceValue = '  revisium://example.com/org/proj/main  ';

      expect(command.parseUrl(whitespaceValue)).toBe(whitespaceValue);
    });

    it('handles unicode characters', () => {
      const unicodeUrl = 'revisium://example.com/org-ñame-用户/project/main';

      expect(command.parseUrl(unicodeUrl)).toBe(unicodeUrl);
    });
  });

  describe('inheritance', () => {
    it('extends CommandRunner', () => {
      expect(command).toBeInstanceOf(CommandRunner);
    });

    it('is an abstract class requiring concrete implementation', () => {
      expect(BaseCommand.prototype.constructor).toBe(BaseCommand);
      expect(command.constructor).not.toBe(BaseCommand);
    });
  });
});
