import { Test, TestingModule } from '@nestjs/testing';
import { CommandRunner } from 'nest-commander';
import { BaseCommand } from '../base.command';

describe('BaseCommand', () => {
  it('parses organization option correctly', () => {
    const testValue = 'test-org';

    const result = command.parseOrganization(testValue);

    expect(result).toBe('test-org');
  });

  it('parses project option correctly', () => {
    const testValue = 'test-project';

    const result = command.parseProject(testValue);

    expect(result).toBe('test-project');
  });

  it('parses branch option correctly', () => {
    const testValue = 'test-branch';

    const result = command.parseBranch(testValue);

    expect(result).toBe('test-branch');
  });

  it('parses API URL option correctly', () => {
    const testValue = 'https://api.example.com';

    const result = command.parseApiUrl(testValue);

    expect(result).toBe('https://api.example.com');
  });

  it('parses username option correctly', () => {
    const testValue = 'testuser';

    const result = command.parseUsername(testValue);

    expect(result).toBe('testuser');
  });

  it('parses password option correctly', () => {
    const testValue = 'testpass123';

    const result = command.parsePassword(testValue);

    expect(result).toBe('testpass123');
  });

  it('handles empty string values', () => {
    expect(command.parseOrganization('')).toBe('');
    expect(command.parseProject('')).toBe('');
    expect(command.parseBranch('')).toBe('');
    expect(command.parseApiUrl('')).toBe('');
    expect(command.parseUsername('')).toBe('');
    expect(command.parsePassword('')).toBe('');
  });

  it('handles special characters in values', () => {
    const specialChars = 'test-value_123.with@special!chars';

    expect(command.parseOrganization(specialChars)).toBe(specialChars);
    expect(command.parseProject(specialChars)).toBe(specialChars);
    expect(command.parseBranch(specialChars)).toBe(specialChars);
    expect(command.parseApiUrl(specialChars)).toBe(specialChars);
    expect(command.parseUsername(specialChars)).toBe(specialChars);
    expect(command.parsePassword(specialChars)).toBe(specialChars);
  });

  it('handles whitespace values correctly', () => {
    const whitespaceValue = '  spaced value  ';

    expect(command.parseOrganization(whitespaceValue)).toBe('  spaced value  ');
    expect(command.parseProject(whitespaceValue)).toBe('  spaced value  ');
    expect(command.parseBranch(whitespaceValue)).toBe('  spaced value  ');
    expect(command.parseApiUrl(whitespaceValue)).toBe('  spaced value  ');
    expect(command.parseUsername(whitespaceValue)).toBe('  spaced value  ');
    expect(command.parsePassword(whitespaceValue)).toBe('  spaced value  ');
  });

  it('handles unicode characters', () => {
    const unicodeValue = 'test-🚀-ñame-用户';

    expect(command.parseOrganization(unicodeValue)).toBe(unicodeValue);
    expect(command.parseProject(unicodeValue)).toBe(unicodeValue);
    expect(command.parseBranch(unicodeValue)).toBe(unicodeValue);
    expect(command.parseApiUrl(unicodeValue)).toBe(unicodeValue);
    expect(command.parseUsername(unicodeValue)).toBe(unicodeValue);
    expect(command.parsePassword(unicodeValue)).toBe(unicodeValue);
  });

  it('extends CommandRunner', () => {
    expect(command).toBeInstanceOf(CommandRunner);
  });

  it('is an abstract class requiring concrete implementation', () => {
    expect(BaseCommand.prototype.constructor).toBe(BaseCommand);
    expect(command.constructor).not.toBe(BaseCommand);
  });

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
});
