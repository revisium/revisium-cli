import { Test, TestingModule } from '@nestjs/testing';
import { SchemaCommand } from '../schema.command';

describe('SchemaCommand', () => {
  it('runs without errors', async () => {
    // Mock the protected command property
    Object.defineProperty(command, 'command', {
      value: { help: jest.fn() },
      configurable: true,
    });

    const result = await command.run();
    expect(result).toBeUndefined();
  });

  it('initializes without errors', () => {
    expect(command).toBeDefined();
    expect(command).toBeInstanceOf(SchemaCommand);
  });

  let command: SchemaCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SchemaCommand],
    }).compile();

    command = module.get<SchemaCommand>(SchemaCommand);
  });
});
